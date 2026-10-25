<?php

namespace Tests\Feature\Account;

use App\Models\TowerSaveSlot;
use App\Models\User;
use App\Models\UserGameData;
use App\Models\UserIdentity;
use App\Services\Account\AccountDeletion;
use App\Services\Admin\AccessAudit;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Tests\TestCase;

class AccountDeletionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    public function test_deleting_an_account_removes_everything_stored_for_it_and_keeps_an_anonymous_record(): void
    {
        $user = User::factory()->create(['email' => 'leaving@example.test']);
        $other = User::factory()->create();
        $user->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'leaving-google', 'email' => 'leaving@example.test']);
        foreach ([$user, $other] as $owner) {
            UserGameData::factory()->for($owner)->create();
            TowerSaveSlot::factory()->for($owner)->create();
        }
        DB::table('sessions')->insert(['id' => 'leaving-session', 'user_id' => $user->getKey(), 'payload' => '', 'last_activity' => time()]);

        $this->actingAs($user)->delete('/account', ['confirmation' => 'DELETE'])
            ->assertRedirect('/')
            ->assertSessionHas('status', 'Your account and its saved progress were deleted.');

        $this->assertGuest();
        $this->assertModelMissing($user);
        $this->assertSame(0, UserGameData::query()->where('user_id', $user->getKey())->count());
        $this->assertSame(0, TowerSaveSlot::query()->where('user_id', $user->getKey())->count());
        $this->assertDatabaseMissing('user_identities', ['subject' => 'leaving-google']);
        $this->assertDatabaseMissing('sessions', ['id' => 'leaving-session']);
        // Someone else's data is untouched.
        $this->assertSame(1, UserGameData::query()->where('user_id', $other->getKey())->count());
        $this->assertSame(1, TowerSaveSlot::query()->where('user_id', $other->getKey())->count());

        $record = AuthAuditLog::query()->where('event', AccessAudit::ACCOUNT_DELETED)->sole();
        $this->assertNull($record->user_id);
        $this->assertSame(['deleted_user_id' => $user->getKey()], $record->metadata);
    }

    public function test_every_table_that_stores_a_user_id_has_a_deletion_decision(): void
    {
        // A new table with a user_id column fails here until AccountDeletion handles it, or it
        // cascades from users, or it is deliberately kept (the audit log nulls its user).
        $decisions = [
            'auth_audit_log' => 'kept, user nulled',
            'email_change_requests' => 'cascades',
            'mandarin_practice_events' => 'cascades',
            'sessions' => 'deleted by AccountDeletion',
            'tower_save_slots' => 'deleted by AccountDeletion',
            'user_game_data' => 'deleted by AccountDeletion',
            'user_identities' => 'cascades',
        ];
        $tables = collect(Schema::getTableListing())
            ->map(fn (string $table): string => str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table)
            ->filter(fn (string $table): bool => Schema::hasColumn($table, 'user_id'))
            ->reject(fn (string $table): bool => in_array($table, [config('bherila-auth.two_factor.table'), config('bherila-auth.passkeys.table')], true) || str_starts_with($table, 'two_factor') || str_contains($table, 'passkey'))
            ->sort()->values()->all();

        $this->assertSame(array_keys($decisions), $tables);
    }

    public function test_deletion_needs_the_typed_confirmation(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->delete('/account', ['confirmation' => 'delete'])->assertSessionHasErrors('confirmation');
        $this->assertModelExists($user);
        $this->assertAuthenticatedAs($user);
    }

    public function test_an_administrator_cannot_delete_their_own_account(): void
    {
        $admin = User::factory()->administrator()->create();

        $this->actingThroughIdentityProvider($admin)->delete('/account', ['confirmation' => 'DELETE'])
            ->assertRedirect('/account')
            ->assertSessionHas('error');
        $this->assertModelExists($admin);
        $this->actingThroughIdentityProvider($admin)->get('/account')->assertOk()->assertSee('Remove the administrator role first');
    }

    public function test_a_grant_after_the_account_was_loaded_still_stops_the_deletion(): void
    {
        $stale = User::factory()->create();
        // Granted elsewhere after this request loaded its user.
        User::query()->whereKey($stale->getKey())->update(['is_admin' => true]);

        try {
            app(AccountDeletion::class)->delete($stale);
            $this->fail('An administrator was deleted.');
        } catch (LogicException) {
            $this->assertModelExists($stale);
            $this->assertSame(0, AuthAuditLog::query()->where('event', AccessAudit::ACCOUNT_DELETED)->count());
        }
    }

    public function test_the_privacy_page_is_public_and_shows_the_contact_only_when_set(): void
    {
        $this->get('/privacy')->assertOk()->assertSee('Playing without an account')->assertDontSee('Questions and requests');
        config(['app.privacy_contact' => 'privacy@example.test']);
        $this->get('/privacy')->assertOk()->assertSee('mailto:privacy@example.test', false);
        $this->get('/')->assertOk()->assertSee(route('privacy'));
        $this->get('/login')->assertOk()->assertSee(route('privacy'));
    }
}
