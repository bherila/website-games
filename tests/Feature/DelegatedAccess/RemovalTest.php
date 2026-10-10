<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use App\Models\UserGameData;
use BWH\Auth\Models\AuthAuditLog;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Mockery;

/**
 * `remove`: take away the access this application manages, which is the administrator flag alone,
 * and keep the account, its binding and its game data. All or nothing, offered exactly when it
 * would succeed or be a no-op.
 */
class RemovalTest extends DelegatedAccessTestCase
{
    public function test_removing_another_administrator_clears_the_flag_and_keeps_the_account_and_its_game_data(): void
    {
        $other = $this->account('other-admin-subject', administrator: true);
        $save = UserGameData::factory()->for($other)->create();
        $before = $other->only(['id', 'name', 'email', 'oauth_provider', 'oauth_subject']);

        $read = $this->delegatedAccessRead(self::MANAGER, 'other-admin-subject');
        $this->assertTrue($read['allowed_edits']['remove']);

        $state = $this->delegatedAccessCall(self::MANAGER, $this->removal(self::MANAGER, 'other-admin-subject', $read['revision']));

        $this->assertTrue($state['provisioned']);
        $this->assertSame(['application_admin' => false, 'workspaces' => []], $state['access']);
        $this->assertNotSame($read['revision'], $state['revision']);
        // Removing again would be a no-op, so it is still offered.
        $this->assertTrue($state['allowed_edits']['remove']);

        $other->refresh();
        $this->assertFalse($other->isAdministrator());
        $this->assertSame($before, $other->only(['id', 'name', 'email', 'oauth_provider', 'oauth_subject']));
        $this->assertTrue(UserGameData::query()->whereKey($save->getKey())->where('user_id', $other->getKey())->exists());
    }

    public function test_a_removal_writes_one_audit_row_and_one_log_entry_with_the_jti_and_operation_id(): void
    {
        $other = $this->account('other-admin-subject', administrator: true);
        $remove = $this->removal(self::MANAGER, 'other-admin-subject');
        Log::spy();

        $this->delegatedAccessCall(self::MANAGER, $remove);

        $row = AuthAuditLog::query()->sole();
        $this->assertSame('delegated_access_changed', $row->event);
        $this->assertSame('delegated', $row->auth_method);
        $this->assertSame($other->getKey(), $row->user_id);
        $this->assertSame($this->manager->getKey(), $row->acting_user_id);
        $this->assertTrue($row->succeeded);
        $this->assertSame('access_removed', $row->metadata['change']);
        $this->assertSame(['application_admin' => true], $row->metadata['before']);
        $this->assertSame(['application_admin' => false], $row->metadata['after']);
        $this->assertSame(1, $row->metadata['administrators_remaining']);
        $this->assertSame($remove['operation_id'], $row->metadata['operation_id']);
        $this->assertIsString($row->metadata['jti']);
        $this->assertNotSame($remove['operation_id'], $row->metadata['jti']);
        $this->assertStringNotContainsString('subject', (string) json_encode($row->metadata));

        Log::shouldHaveReceived('info')->with('Delegated access change.', Mockery::on(fn (array $context): bool => $context['change'] === 'access_removed'
            && $context['user'] === 'users#'.$other->getKey()
            && $context['actor'] === 'users#'.$this->manager->getKey()
            && $context['operation_id'] === $remove['operation_id']
            && ! str_contains((string) json_encode($context), 'subject')))->once();
    }

    public function test_removing_an_account_without_the_flag_is_a_no_op_that_keeps_the_revision(): void
    {
        $player = $this->account('player-subject');
        UserGameData::factory()->for($player)->create();
        $read = $this->delegatedAccessRead(self::MANAGER, 'player-subject');
        $this->assertTrue($read['allowed_edits']['remove']);
        Log::spy();

        $state = $this->delegatedAccessCall(self::MANAGER, $this->removal(self::MANAGER, 'player-subject', $read['revision']));

        $this->assertSame([...$read, 'operation' => 'remove'], $state);
        $this->assertSame(0, AuthAuditLog::query()->count());
        Log::shouldNotHaveReceived('info');
        $this->assertSame(1, UserGameData::query()->where('user_id', $player->getKey())->count());
    }

    public function test_an_administrator_may_not_remove_themselves_even_with_another_administrator(): void
    {
        // The last-administrator rule would allow this; only the self-demotion rule refuses it.
        $this->account('other-admin-subject', administrator: true);

        $read = $this->delegatedAccessRead(self::MANAGER, self::MANAGER);
        $this->assertFalse($read['allowed_edits']['remove']);

        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal(self::MANAGER, $this->removal(self::MANAGER, self::MANAGER, $read['revision'])));
        $this->assertTrue($this->manager->refresh()->isAdministrator());
        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    /**
     * The last administrator who can sign in is the actor whenever an actor may ask at all, so
     * both rules refuse it. Flags nobody can use (unbound, or bound under another provider) do not
     * make it removable.
     */
    public function test_the_last_administrator_who_can_sign_in_is_not_removable(): void
    {
        User::factory()->create()->forceFill(['is_admin' => true])->save();
        $this->account(self::MANAGER, administrator: true, provider: 'another-provider');

        $read = $this->delegatedAccessRead(self::MANAGER, self::MANAGER);
        $this->assertFalse($read['allowed_edits']['remove']);
        $this->assertDelegatedRemoveRefusedWithoutPartialChange(self::MANAGER, self::MANAGER);
        $this->assertTrue($this->manager->refresh()->isAdministrator());
        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    public function test_an_unprovisioned_subject_is_not_removable(): void
    {
        $read = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'read', 'subject' => 'newcomer']);
        $this->assertFalse($read['allowed_edits']['remove']);

        $this->assertSame(DelegatedRefusal::NOT_PROVISIONED, $this->refusal(self::MANAGER, $this->removal(self::MANAGER, 'newcomer', hash('sha256', 'any'))));
        $this->assertSame(0, User::query()->where('oauth_subject', 'newcomer')->count());
    }

    public function test_a_stale_revision_is_refused_and_changes_nothing(): void
    {
        $other = $this->account('other-admin-subject', administrator: true);

        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $this->removal(self::MANAGER, 'other-admin-subject', hash('sha256', 'stale'))));
        $this->assertTrue($other->refresh()->isAdministrator());
    }

    /**
     * Decided on the locked rows: the flag granted after the read but before the removal took
     * its locks changes the revision, so the removal is a conflict rather than a silent revoke.
     */
    public function test_the_revision_is_compared_under_the_locks(): void
    {
        $player = $this->account('player-subject');
        $remove = $this->removal(self::MANAGER, 'player-subject');

        $done = false;
        Event::listen(TransactionBeginning::class, function () use (&$done, $player): void {
            if (! $done) {
                $done = true;
                DB::table('users')->where('id', $player->getKey())->update(['is_admin' => true]);
            }
        });

        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $remove));
        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    public function test_a_player_may_not_remove_anyone(): void
    {
        $other = $this->account('other-admin-subject', administrator: true);
        $this->account('player-subject');
        $revision = $this->delegatedAccessRead(self::MANAGER, 'other-admin-subject')['revision'];

        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal('player-subject', $this->removal('player-subject', 'other-admin-subject', $revision)));
        $this->assertTrue($other->refresh()->isAdministrator());
    }
}
