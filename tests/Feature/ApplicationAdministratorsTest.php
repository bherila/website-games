<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Admin\AccessAudit;
use App\Services\Admin\AdministratorChangeOrigin;
use App\Services\Admin\AdministratorChangeRefused;
use App\Services\Admin\ApplicationAdministrators;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use LogicException;
use Tests\TestCase;

/**
 * The last-administrator rule: the app never loses its last administrator who can still sign
 * in. "Can sign in" means bound to a subject under the configured provider, because that
 * binding is all sign-in resolves on.
 */
class ApplicationAdministratorsTest extends TestCase
{
    use RefreshDatabase;

    private ApplicationAdministrators $administrators;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('bherila-auth.oauth_client.provider', 'bherila');
        $this->administrators = $this->app->make(ApplicationAdministrators::class);
    }

    public function test_the_last_administrator_who_can_sign_in_cannot_be_revoked(): void
    {
        $only = User::factory()->administrator()->create();

        $this->assertFalse($this->administrators->canRevoke($only));

        try {
            $this->administrators->revoke($only, AdministratorChangeOrigin::console());
            $this->fail('Revoking the last administrator must be refused.');
        } catch (AdministratorChangeRefused $refused) {
            $this->assertSame(AdministratorChangeRefused::LAST_ADMINISTRATOR, $refused->reason);
        }

        $this->assertTrue($only->fresh()?->isAdministrator());
    }

    public function test_an_administrator_can_be_revoked_while_another_can_still_sign_in(): void
    {
        $first = User::factory()->administrator()->create();
        $second = User::factory()->administrator()->create();

        $this->assertTrue($this->administrators->canRevoke($first));
        $this->assertTrue($this->administrators->revoke($first, AdministratorChangeOrigin::console()));
        $this->assertFalse($first->isAdministrator());

        // Now the second is the last one, and the rule holds for it in turn.
        $this->assertFalse($this->administrators->canRevoke($second));
        $this->expectException(AdministratorChangeRefused::class);
        $this->administrators->revoke($second, AdministratorChangeOrigin::console());
    }

    public function test_an_administrator_who_cannot_sign_in_does_not_count_towards_the_rule(): void
    {
        $bound = User::factory()->administrator()->create();
        $unbound = User::factory()->create();
        DB::table('users')->where('id', $unbound->getKey())->update(['is_admin' => true]);
        $otherProvider = User::factory()->administrator()->create(['oauth_provider' => 'some-other-provider']);

        // Two other rows hold the flag, but neither can sign in here, so the bound one is last.
        $this->assertFalse($this->administrators->canRevoke($bound));
        $this->expectExceptionObject(AdministratorChangeRefused::lastAdministrator($bound));

        try {
            $this->administrators->revoke($bound, AdministratorChangeOrigin::console());
        } finally {
            // Removing flags nobody can use never strands the app, so those are allowed.
            $this->assertTrue($this->administrators->revoke($unbound->refresh(), AdministratorChangeOrigin::console()));
            $this->assertTrue($this->administrators->revoke($otherProvider, AdministratorChangeOrigin::console()));
            $this->assertTrue($bound->fresh()?->isAdministrator());
        }
    }

    public function test_revocation_decides_from_the_database_not_from_the_callers_model(): void
    {
        $first = User::factory()->administrator()->create();
        $second = User::factory()->administrator()->create();

        // A caller that checked earlier and is now acting on a stale picture: the second
        // administrator was revoked elsewhere in between.
        $this->assertTrue($this->administrators->canRevoke($first));
        DB::table('users')->where('id', $second->getKey())->update(['is_admin' => false]);

        $this->expectException(AdministratorChangeRefused::class);
        $this->administrators->revoke($first, AdministratorChangeOrigin::console());
    }

    public function test_revoking_and_granting_are_idempotent(): void
    {
        $player = User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'player']);
        User::factory()->administrator()->create();

        $this->assertFalse($this->administrators->revoke($player, AdministratorChangeOrigin::console()));
        $this->assertTrue($this->administrators->grant($player, AdministratorChangeOrigin::console()));
        $this->assertFalse($this->administrators->grant($player, AdministratorChangeOrigin::console()));
        $this->assertTrue($player->fresh()?->isAdministrator());
    }

    public function test_an_account_that_cannot_sign_in_is_never_granted(): void
    {
        $unbound = User::factory()->create();

        $this->expectExceptionObject(AdministratorChangeRefused::cannotSignIn($unbound));

        try {
            $this->administrators->grant($unbound, AdministratorChangeOrigin::console());
        } finally {
            $this->assertFalse($unbound->fresh()?->isAdministrator());
        }
    }

    public function test_changes_are_refused_when_the_provider_is_not_configured(): void
    {
        $first = User::factory()->administrator()->create();
        User::factory()->administrator()->create();
        Config::set('bherila-auth.oauth_client.provider', '');

        $this->assertFalse($this->administrators->canRevoke($first));
        $this->expectExceptionObject(AdministratorChangeRefused::providerUnknown());
        $this->administrators->revoke($first, AdministratorChangeOrigin::console());
    }

    public function test_changes_are_logged_by_row_id_only(): void
    {
        Log::spy();
        $player = User::factory()->create([
            'email' => 'player@example.test',
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'player-subject',
        ]);
        User::factory()->administrator()->create();

        $this->administrators->grant($player, AdministratorChangeOrigin::console());
        $this->administrators->revoke($player, AdministratorChangeOrigin::console());

        $expected = 'users#'.$player->getKey();
        Log::shouldHaveReceived('notice')->with('Application administrator granted.', ['user' => $expected, 'actor' => 'console'])->once();
        Log::shouldHaveReceived('notice')->with('Application administrator revoked.', ['user' => $expected, 'actor' => 'console', 'administrators_remaining' => 1])->once();
    }

    public function test_every_change_writes_one_audit_row_and_a_no_op_writes_none(): void
    {
        // The package's audit driver is off; the record of an access change does not depend on it.
        Config::set('bherila-auth.audit.driver', 'null');
        $player = User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'player-subject']);
        User::factory()->administrator()->create();

        $this->assertTrue($this->administrators->grant($player, AdministratorChangeOrigin::console()));
        $this->assertFalse($this->administrators->grant($player, AdministratorChangeOrigin::console()));
        $this->assertTrue($this->administrators->revoke($player, AdministratorChangeOrigin::console()));
        $this->assertFalse($this->administrators->revoke($player, AdministratorChangeOrigin::console()));

        $rows = AuthAuditLog::query()->orderBy('id')->get();
        $this->assertCount(2, $rows);

        [$granted, $revoked] = [$rows[0], $rows[1]];
        $this->assertSame(AccessAudit::ADMIN_GRANTED, $granted->event);
        $this->assertSame($player->getKey(), $granted->user_id);
        $this->assertNull($granted->acting_user_id);
        $this->assertSame('console', $granted->auth_method);
        $this->assertTrue($granted->succeeded);
        $this->assertNull($granted->email);
        $this->assertSame([
            'change' => 'administrator_granted',
            'before' => ['application_admin' => false],
            'after' => ['application_admin' => true],
        ], $granted->metadata);

        $this->assertSame(AccessAudit::ADMIN_REVOKED, $revoked->event);
        $this->assertSame($player->getKey(), $revoked->user_id);
        $this->assertSame([
            'change' => 'administrator_revoked',
            'before' => ['application_admin' => true],
            'after' => ['application_admin' => false],
            'administrators_remaining' => 1,
        ], $revoked->metadata);
    }

    public function test_a_refused_change_writes_no_audit_row(): void
    {
        $only = User::factory()->administrator()->create();
        $unbound = User::factory()->create(['oauth_provider' => null, 'oauth_subject' => null]);

        foreach ([fn () => $this->administrators->revoke($only, AdministratorChangeOrigin::console()), fn () => $this->administrators->grant($unbound, AdministratorChangeOrigin::console())] as $change) {
            try {
                $change();
                $this->fail('The change was accepted.');
            } catch (AdministratorChangeRefused) {
            }
        }

        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    /**
     * The audit row is written in the change's transaction, so a change that cannot be recorded
     * does not happen.
     */
    public function test_a_failed_audit_write_rolls_the_change_back(): void
    {
        $player = User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'player-subject']);
        $admin = User::factory()->administrator()->create();
        User::factory()->administrator()->create();
        Config::set('bherila-auth.audit.table', 'missing_audit_table');

        try {
            $this->administrators->grant($player, AdministratorChangeOrigin::console());
            $this->fail('The grant succeeded without its audit row.');
        } catch (QueryException) {
        }
        $this->assertFalse($player->fresh()?->isAdministrator());

        try {
            $this->administrators->revoke($admin, AdministratorChangeOrigin::console());
            $this->fail('The revocation succeeded without its audit row.');
        } catch (QueryException) {
        }
        $this->assertTrue($admin->fresh()?->isAdministrator());
    }

    public function test_the_audit_refuses_to_write_outside_a_transaction(): void
    {
        $user = User::factory()->create();
        // RefreshDatabase wraps each test in a transaction; step outside it to prove the guard.
        $level = DB::transactionLevel();
        DB::rollBack(0);

        try {
            $this->app->make(AccessAudit::class)->record(AccessAudit::ADMIN_GRANTED, $user, null, 'console', []);
            $this->fail('An audit row was written outside a transaction.');
        } catch (LogicException) {
        } finally {
            for ($i = 0; $i < $level; $i++) {
                DB::beginTransaction();
            }
        }

        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    public function test_the_flag_is_not_mass_assignable(): void
    {
        $user = User::query()->create([
            'name' => 'Player',
            'email' => 'mass-assigned@example.test',
            'password' => 'not-a-real-password',
            'is_admin' => true,
        ]);

        $this->assertFalse($user->fresh()?->isAdministrator());
    }

    public function test_the_administer_gate_follows_the_flag(): void
    {
        $this->assertTrue(Gate::forUser(User::factory()->administrator()->create())->allows('administer'));
        $this->assertFalse(Gate::forUser(User::factory()->create())->allows('administer'));
    }
}
