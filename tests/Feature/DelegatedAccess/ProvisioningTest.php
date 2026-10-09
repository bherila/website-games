<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;
use BWH\Auth\OAuth\PendingAccount;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery;

/**
 * Provisioning: an update with `expected_revision: null` creates the account for a subject this
 * application has not seen, bound to it, and nothing else.
 */
class ProvisioningTest extends DelegatedAccessTestCase
{
    public function test_an_unknown_subject_reads_as_provisionable(): void
    {
        $state = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'read', 'subject' => 'newcomer']);

        $this->assertFalse($state['provisioned']);
        $this->assertNull($state['revision']);
        $this->assertTrue($state['allowed_edits']['provision']);
    }

    public function test_provisioning_creates_an_account_bound_to_the_exact_subject(): void
    {
        Log::spy();

        $state = $this->delegatedAccessCall(self::MANAGER, $this->provisioning('newcomer', displayName: 'Example Newcomer'));

        $this->assertTrue($state['provisioned']);
        $this->assertSame(['application_admin' => false, 'workspaces' => []], $state['access']);
        $this->assertFalse($state['allowed_edits']['provision']);

        $user = User::query()->where('oauth_provider', self::PROVIDER)->where('oauth_subject', 'newcomer')->sole();
        $this->assertSame('Example Newcomer', $user->name);
        $this->assertSame(PendingAccount::email(self::PROVIDER, 'newcomer'), $user->email);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse($user->isAdministrator());

        Log::shouldHaveReceived('info')->with('Delegated access change.', Mockery::on(fn (array $context): bool => $context['change'] === 'account_provisioned'
            && $context['user'] === 'users#'.$user->getKey()
            && $context['actor'] === 'users#'.$this->manager->getKey()
            && $context['application_admin'] === false
            && is_string($context['jti'])
            && ! str_contains((string) json_encode($context), 'newcomer')))->once();
    }

    public function test_without_a_display_name_the_placeholder_name_is_used(): void
    {
        $this->delegatedAccessCall(self::MANAGER, $this->provisioning('newcomer'));

        $this->assertSame(PendingAccount::name('Pending player', 'newcomer'), User::query()->where('oauth_subject', 'newcomer')->sole()->name);
    }

    /**
     * The new account is bound to the subject the provider asserted, so it is an administrator
     * who can sign in: what `users:admin grant` allows for a bound row.
     */
    public function test_provisioning_may_create_an_administrator_who_can_sign_in(): void
    {
        $state = $this->delegatedAccessCall(self::MANAGER, $this->provisioning('new-admin', administrator: true));

        $this->assertTrue($state['access']['application_admin']);
        // There are two administrators now, so the actor may demote the new one.
        $this->assertTrue($state['allowed_edits']['application_admin']);
        $this->assertTrue(User::query()->where('oauth_subject', 'new-admin')->sole()->isAdministrator());
        $this->assertTrue($this->delegatedAccessRead(self::MANAGER, self::MANAGER)['allowed_edits']['application_admin'] === false);
    }

    public function test_a_bound_subject_is_a_conflict_and_nothing_changes(): void
    {
        $existing = $this->account('existing-subject');
        $before = $existing->getAttributes();
        Log::spy();

        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $this->provisioning('existing-subject', administrator: true, displayName: 'Someone Else')));

        $this->assertSame($before, $existing->refresh()->getAttributes());
        $this->assertSame(1, User::query()->where('oauth_subject', 'existing-subject')->count());
        Log::shouldNotHaveReceived('info');
    }

    /**
     * Provisioning never takes over a row. An unbound row is not adopted, whatever it holds, and
     * a row bound under another provider is a different identity.
     */
    public function test_provisioning_never_adopts_an_existing_row(): void
    {
        // An unbound row that holds the very address provisioning would use: still refused, never
        // bound. The address is never a key, even this one.
        $squatter = User::factory()->create(['email' => PendingAccount::email(self::PROVIDER, 'newcomer')]);
        $this->assertSame(DelegatedRefusal::REVISION_CONFLICT, $this->refusal(self::MANAGER, $this->provisioning('newcomer')));
        $this->assertNull($squatter->refresh()->oauth_subject);
        $this->assertSame(0, User::query()->where('oauth_subject', 'newcomer')->count());

        // An unbound legacy row with a real address, and the same subject under another provider,
        // both stay exactly as they were; provisioning makes a row of its own.
        $legacy = User::factory()->create(['name' => 'Legacy Player', 'email' => 'legacy@example.test']);
        $elsewhere = $this->account('second-newcomer', provider: 'another-provider');
        $state = $this->delegatedAccessCall(self::MANAGER, $this->provisioning('second-newcomer', displayName: 'Legacy Player'));

        $this->assertTrue($state['provisioned']);
        $created = User::query()->where('oauth_provider', self::PROVIDER)->where('oauth_subject', 'second-newcomer')->sole();
        $this->assertNotContains($created->getKey(), [$legacy->getKey(), $elsewhere->getKey(), $squatter->getKey()]);
        $this->assertNull($legacy->refresh()->oauth_subject);
        $this->assertSame('another-provider', $elsewhere->refresh()->oauth_provider);
    }

    /**
     * Sign-in resolves on the same binding, so the person's first sign-in lands in the row that
     * was provisioned for them, fills in their real name and address, and keeps the flag.
     */
    public function test_first_sign_in_after_provisioning_reuses_the_provisioned_row(): void
    {
        $this->delegatedAccessCall(self::MANAGER, $this->provisioning('newcomer', administrator: true, displayName: 'Placeholder'));
        $provisioned = User::query()->where('oauth_subject', 'newcomer')->sole();
        $users = User::query()->count();

        $this->signIn('newcomer', 'Real Name', 'real-address@example.test');

        $this->assertAuthenticatedAs($provisioned);
        $this->assertSame($users, User::query()->count());
        $provisioned->refresh();
        $this->assertSame('Real Name', $provisioned->name);
        $this->assertSame('real-address@example.test', $provisioned->email);
        $this->assertTrue($provisioned->isAdministrator());
        $this->assertTrue($this->delegatedAccessRead(self::MANAGER, 'newcomer')['provisioned']);
    }

    private function signIn(string $subject, string $name, string $email): void
    {
        Config::set('bherila-auth.oauth_client', [
            'provider' => self::PROVIDER,
            'base_url' => 'https://identity.example.test',
            'client_id' => 'games-client',
            'client_secret' => 'games-secret',
            'redirect_uri' => 'http://localhost/oauth/callback',
            'scope' => 'identity:read',
            'authorize_path' => '/oauth/authorize',
            'token_path' => '/oauth/token',
            'identity_path' => '/api/oauth/user',
            'end_session_path' => '/oauth/end-session',
        ]);
        Http::fake(fn (Request $request) => match ($request->url()) {
            'https://identity.example.test/oauth/token' => Http::response(['access_token' => 'test-access-token']),
            'https://identity.example.test/api/oauth/user' => Http::response(['sub' => $subject, 'name' => $name, 'email' => $email]),
            default => Http::response([], 404),
        });

        $this->withSession(['oauth.login.state' => 'expected-state', 'oauth.login.code_verifier' => str_repeat('v', 64)])
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');
    }
}
