<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Admin\AdministratorChangeRefused;
use App\Services\Admin\ApplicationAdministrators;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
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
            $this->administrators->revoke($only, 'test');
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
        $this->assertTrue($this->administrators->revoke($first, 'test'));
        $this->assertFalse($first->isAdministrator());

        // Now the second is the last one, and the rule holds for it in turn.
        $this->assertFalse($this->administrators->canRevoke($second));
        $this->expectException(AdministratorChangeRefused::class);
        $this->administrators->revoke($second, 'test');
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
            $this->administrators->revoke($bound, 'test');
        } finally {
            // Removing flags nobody can use never strands the app, so those are allowed.
            $this->assertTrue($this->administrators->revoke($unbound->refresh(), 'test'));
            $this->assertTrue($this->administrators->revoke($otherProvider, 'test'));
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
        $this->administrators->revoke($first, 'test');
    }

    public function test_revoking_and_granting_are_idempotent(): void
    {
        $player = User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'player']);
        User::factory()->administrator()->create();

        $this->assertFalse($this->administrators->revoke($player, 'test'));
        $this->assertTrue($this->administrators->grant($player, 'test'));
        $this->assertFalse($this->administrators->grant($player, 'test'));
        $this->assertTrue($player->fresh()?->isAdministrator());
    }

    public function test_an_account_that_cannot_sign_in_is_never_granted(): void
    {
        $unbound = User::factory()->create();

        $this->expectExceptionObject(AdministratorChangeRefused::cannotSignIn($unbound));

        try {
            $this->administrators->grant($unbound, 'test');
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
        $this->administrators->revoke($first, 'test');
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

        $this->administrators->grant($player, 'console');
        $this->administrators->revoke($player, 'console');

        $expected = 'users#'.$player->getKey();
        Log::shouldHaveReceived('notice')->with('Application administrator granted.', ['user' => $expected, 'actor' => 'console'])->once();
        Log::shouldHaveReceived('notice')->with('Application administrator revoked.', ['user' => $expected, 'actor' => 'console', 'administrators_remaining' => 1])->once();
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
