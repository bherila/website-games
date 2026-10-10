<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use BWH\Auth\Models\AuthAuditLog;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Mockery;

/**
 * The application administrator flag through delegated access: what may change, what is
 * reported as not editable, and that every rule is decided again on the locked rows.
 */
class AdministratorFlagTest extends DelegatedAccessTestCase
{
    public function test_self_demotion_is_reported_and_refused_even_with_another_administrator(): void
    {
        // With a second administrator who can sign in, the last-administrator rule would allow
        // this. Only the self-demotion rule stands in the way.
        $this->account('other-admin-subject', administrator: true);

        $state = $this->delegatedAccessRead(self::MANAGER, self::MANAGER);
        $this->assertTrue($state['access']['application_admin']);
        $this->assertFalse($state['allowed_edits']['application_admin']);

        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal(self::MANAGER, $this->setAdministrator(self::MANAGER, self::MANAGER, false)));
        $this->assertTrue($this->manager->refresh()->isAdministrator());
    }

    /**
     * Through this endpoint the last administrator who can sign in is always the actor (the
     * actor must be one), so the self-demotion rule and the service's last-administrator rule
     * both refuse it. The read reports it from {@see ApplicationAdministrators::canRevoke()}.
     */
    public function test_the_last_administrator_is_reported_and_refused(): void
    {
        // Flags nobody can use do not count: one unbound, one bound under another provider.
        User::factory()->create()->forceFill(['is_admin' => true])->save();
        $this->account(self::MANAGER, administrator: true, provider: 'another-provider');

        $this->assertFalse($this->delegatedAccessRead(self::MANAGER, self::MANAGER)['allowed_edits']['application_admin']);
        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal(self::MANAGER, $this->setAdministrator(self::MANAGER, self::MANAGER, false)));
        $this->assertTrue($this->manager->refresh()->isAdministrator());
    }

    public function test_another_account_is_granted_and_revoked_with_a_logged_jti_and_row_ids_only(): void
    {
        $player = $this->account('player-subject');
        Log::spy();

        $read = $this->delegatedAccessRead(self::MANAGER, 'player-subject');
        $this->assertTrue($read['allowed_edits']['application_admin']);

        $granted = $this->delegatedAccessCall(self::MANAGER, $this->setAdministrator(self::MANAGER, 'player-subject', true, $read['revision']));
        $this->assertTrue($granted['access']['application_admin']);
        $this->assertNotSame($read['revision'], $granted['revision']);
        $this->assertTrue($player->refresh()->isAdministrator());

        // Now there are two, so either may be revoked by the other.
        $this->assertTrue($granted['allowed_edits']['application_admin']);
        $revoked = $this->delegatedAccessCall(self::MANAGER, $this->setAdministrator(self::MANAGER, 'player-subject', false, $granted['revision']));
        $this->assertFalse($revoked['access']['application_admin']);
        $this->assertFalse($player->refresh()->isAdministrator());

        foreach (['administrator_granted', 'administrator_revoked'] as $change) {
            Log::shouldHaveReceived('info')->with('Delegated access change.', Mockery::on(fn (array $context): bool => $context['change'] === $change
                && $context['user'] === 'users#'.$player->getKey()
                && $context['actor'] === 'users#'.$this->manager->getKey()
                && is_string($context['jti']) && strlen($context['jti']) === 64
                && ! str_contains((string) json_encode($context), 'subject')
                && ! str_contains((string) json_encode($context), '@')))->once();
        }
        // The service's own entries carry the delegated actor too.
        Log::shouldHaveReceived('notice')->with('Application administrator granted.', ['user' => 'users#'.$player->getKey(), 'actor' => 'delegated-access users#'.$this->manager->getKey()])->once();
    }

    public function test_each_flag_change_writes_one_audit_row_with_the_actor_target_and_jti(): void
    {
        Config::set('bherila-auth.audit.driver', 'null');
        $player = $this->account('player-subject');

        $granted = $this->delegatedAccessCall(self::MANAGER, $this->setAdministrator(self::MANAGER, 'player-subject', true));
        $this->delegatedAccessCall(self::MANAGER, $this->setAdministrator(self::MANAGER, 'player-subject', false, $granted['revision']));

        $rows = AuthAuditLog::query()->orderBy('id')->get();
        $this->assertCount(2, $rows);
        foreach ([[$rows[0], 'administrator_granted', false, true], [$rows[1], 'administrator_revoked', true, false]] as [$row, $change, $before, $after]) {
            $this->assertSame('delegated_access_changed', $row->event);
            $this->assertSame('delegated', $row->auth_method);
            $this->assertSame($player->getKey(), $row->user_id);
            $this->assertSame($this->manager->getKey(), $row->acting_user_id);
            $this->assertTrue($row->succeeded);
            $this->assertNull($row->email);
            $this->assertSame($change, $row->metadata['change']);
            $this->assertSame(['application_admin' => $before], $row->metadata['before']);
            $this->assertSame(['application_admin' => $after], $row->metadata['after']);
            $this->assertIsString($row->metadata['jti']);
            $this->assertSame(64, strlen($row->metadata['jti']));
            $this->assertStringNotContainsString('subject', (string) json_encode($row->metadata));
        }
        $this->assertNotSame($rows[0]->metadata['jti'], $rows[1]->metadata['jti']);
    }

    public function test_a_failed_audit_write_rolls_the_flag_change_back(): void
    {
        $player = $this->account('player-subject');
        $update = $this->setAdministrator(self::MANAGER, 'player-subject', true);
        Config::set('bherila-auth.audit.table', 'missing_audit_table');

        try {
            $this->delegatedAccessCall(self::MANAGER, $update);
            $this->fail('The flag changed without its audit row.');
        } catch (QueryException) {
        }

        $this->assertFalse($player->refresh()->isAdministrator());
    }

    public function test_resubmitting_the_current_value_changes_and_logs_nothing(): void
    {
        $this->account('player-subject');
        Log::spy();

        $state = $this->delegatedAccessCall(self::MANAGER, $this->setAdministrator(self::MANAGER, 'player-subject', false));

        $this->assertFalse($state['access']['application_admin']);
        Log::shouldNotHaveReceived('info');
        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    /**
     * The revision is compared on the row the change locks, not on an earlier read: a change
     * landing after the adapter authorized the actor, but before it took its locks, is caught.
     */
    public function test_the_revision_is_compared_under_the_locks(): void
    {
        $player = $this->account('player-subject');
        $update = $this->setAdministrator(self::MANAGER, 'player-subject', true);

        // A concurrent change of the target's flag lands just as the adapter's transaction opens.
        $this->onceTransactionBegins(fn () => DB::table('users')->where('id', $player->getKey())->update(['is_admin' => true]));
        // (The concurrent write ran inside the adapter's transaction, so the refusal rolls it back too.)
        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $update));
    }

    /**
     * The actor's authority is re-checked under the same locks: an administrator demoted while
     * their request was in flight changes nothing.
     */
    public function test_an_actor_demoted_mid_request_is_refused_under_the_locks(): void
    {
        $this->account('other-admin-subject', administrator: true);
        $player = $this->account('player-subject');
        $update = $this->setAdministrator(self::MANAGER, 'player-subject', true);

        $this->onceTransactionBegins(fn () => DB::table('users')->where('id', $this->manager->getKey())->update(['is_admin' => false]));
        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal(self::MANAGER, $update));
        $this->assertFalse($player->refresh()->isAdministrator());
    }

    public function test_a_target_gone_since_the_read_is_a_conflict(): void
    {
        $player = $this->account('player-subject');
        $update = $this->setAdministrator(self::MANAGER, 'player-subject', true);
        $player->delete();

        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $update));
        $this->assertSame(0, User::query()->where('oauth_subject', 'player-subject')->count());
    }

    public function test_subjects_lists_bound_accounts_by_name_in_pages(): void
    {
        foreach (range(1, 3) as $n) {
            $this->account("player-{$n}")->forceFill(['name' => "Player {$n}"])->save();
        }
        // Not addressable by subject here, so not listed.
        User::factory()->create(['name' => 'Unbound']);
        $this->account('elsewhere', provider: 'another-provider');

        $first = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'limit' => 2]);
        $this->assertSame([self::MANAGER, 'player-1'], array_column($first['subjects'], 'subject'));
        $this->assertSame('Player 1', $first['subjects'][1]['label']);
        $this->assertIsString($first['next_cursor']);

        $second = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'limit' => 2, 'cursor' => $first['next_cursor']]);
        $this->assertSame(['player-2', 'player-3'], array_column($second['subjects'], 'subject'));
        $this->assertNull($second['next_cursor']);
        $this->assertStringNotContainsString('@', (string) json_encode([$first, $second]));
    }

    private function onceTransactionBegins(callable $change): void
    {
        $done = false;
        Event::listen(TransactionBeginning::class, function () use (&$done, $change): void {
            if (! $done) {
                $done = true;
                $change();
            }
        });
    }
}
