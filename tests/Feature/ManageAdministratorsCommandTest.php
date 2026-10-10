<?php

namespace Tests\Feature;

use App\Models\User;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class ManageAdministratorsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('bherila-auth.oauth_client.provider', 'bherila');
    }

    public function test_it_grants_the_first_administrator_and_is_safe_to_re_run(): void
    {
        $user = $this->boundUser();

        $this->artisan('users:admin', ['action' => 'grant', 'user' => (string) $user->getKey()])
            ->expectsOutputToContain('is now an administrator')
            ->assertSuccessful();
        $this->artisan('users:admin', ['action' => 'grant', 'user' => (string) $user->getKey()])
            ->expectsOutputToContain('is already an administrator')
            ->assertSuccessful();

        $this->assertTrue($user->fresh()?->isAdministrator());

        // One audit row for the grant, none for the idempotent re-run.
        $row = AuthAuditLog::query()->sole();
        $this->assertSame('application_admin_granted', $row->event);
        $this->assertSame('console', $row->auth_method);
        $this->assertSame($user->getKey(), $row->user_id);
        $this->assertNull($row->acting_user_id);
    }

    public function test_it_revokes_and_is_safe_to_re_run(): void
    {
        User::factory()->administrator()->create();
        $user = User::factory()->administrator()->create();

        $this->artisan('users:admin', ['action' => 'revoke', 'user' => (string) $user->getKey()])
            ->expectsOutputToContain('is no longer an administrator')
            ->assertSuccessful();
        $this->artisan('users:admin', ['action' => 'revoke', 'user' => (string) $user->getKey()])
            ->expectsOutputToContain('is not an administrator')
            ->assertSuccessful();

        $this->assertFalse($user->fresh()?->isAdministrator());

        $row = AuthAuditLog::query()->sole();
        $this->assertSame('application_admin_revoked', $row->event);
        $this->assertSame('console', $row->auth_method);
        $this->assertSame($user->getKey(), $row->user_id);
    }

    public function test_it_refuses_to_revoke_the_last_administrator_who_can_sign_in(): void
    {
        $only = User::factory()->administrator()->create();

        $this->artisan('users:admin', ['action' => 'revoke', 'user' => (string) $only->getKey()])
            ->expectsOutputToContain('last administrator who can sign in')
            ->assertFailed();

        $this->assertTrue($only->fresh()?->isAdministrator());
        $this->assertSame(0, AuthAuditLog::query()->count());
    }

    public function test_it_refuses_an_unknown_account(): void
    {
        $this->artisan('users:admin', ['action' => 'grant', 'user' => '999'])
            ->expectsOutputToContain('There is no users#999.')
            ->assertFailed();

        $this->assertSame(0, User::query()->count());
    }

    /**
     * An address is not an identifier here: the provider does not verify it and its owner can
     * change it. Neither an exact address nor anything that merely starts with an id resolves.
     */
    public function test_it_never_resolves_an_account_by_address_or_loose_id(): void
    {
        $user = $this->boundUser(['email' => 'someone@example.test']);

        foreach (['someone@example.test', 'SOMEONE@example.test', $user->getKey().'abc', ' '.$user->getKey(), '0'.$user->getKey(), '-1'] as $identifier) {
            $this->artisan('users:admin', ['action' => 'grant', 'user' => $identifier])
                ->expectsOutputToContain('exact numeric users id')
                ->assertFailed();
        }

        $this->artisan('users:admin', ['action' => 'grant'])->assertFailed();
        $this->assertFalse($user->fresh()?->isAdministrator());
    }

    public function test_it_refuses_an_account_that_cannot_sign_in(): void
    {
        $unbound = User::factory()->create();

        $this->artisan('users:admin', ['action' => 'grant', 'user' => (string) $unbound->getKey()])
            ->expectsOutputToContain('oauth:bind-subject')
            ->assertFailed();

        $this->assertFalse($unbound->fresh()?->isAdministrator());
    }

    public function test_it_refuses_an_unknown_action(): void
    {
        $user = $this->boundUser();

        $this->artisan('users:admin', ['action' => 'promote', 'user' => (string) $user->getKey()])
            ->expectsOutputToContain('grant, revoke or list')
            ->assertFailed();
    }

    public function test_it_lists_administrators_and_whether_they_can_sign_in(): void
    {
        $bound = User::factory()->administrator()->create(['name' => 'Bound Admin', 'email' => 'bound@example.test']);
        $unbound = User::factory()->create(['name' => 'Unbound Admin', 'email' => 'unbound@example.test']);
        $unbound->forceFill(['is_admin' => true])->save();
        User::factory()->create(['name' => 'Ordinary Player']);

        $this->artisan('users:admin', ['action' => 'list'])
            ->expectsTable(['id', 'name', 'email', 'can sign in'], [
                [$bound->getKey(), 'Bound Admin', 'bound@example.test', 'yes'],
                [$unbound->getKey(), 'Unbound Admin', 'unbound@example.test', 'no'],
            ])
            ->assertSuccessful();
    }

    public function test_listing_with_no_administrators_says_how_to_grant_one(): void
    {
        $this->boundUser();

        $this->artisan('users:admin', ['action' => 'list'])
            ->expectsOutputToContain('There are no administrators.')
            ->assertSuccessful();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function boundUser(array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'subject-'.fake()->unique()->numerify('####'),
        ], $attributes));
    }
}
