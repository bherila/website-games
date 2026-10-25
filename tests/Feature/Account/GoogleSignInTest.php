<?php

namespace Tests\Feature\Account;

use App\Models\User;
use App\Models\UserIdentity;
use App\Services\Account\SignInMethod;
use App\Services\Admin\AccessAudit;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Tests\TestCase;

class GoogleSignInTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        config(['services.google.client_id' => 'google-client', 'services.google.client_secret' => 'google-secret']);
    }

    public function test_google_sign_in_is_off_until_configured(): void
    {
        config(['services.google.client_id' => null]);

        $this->get('/oauth/google/redirect')->assertNotFound();
        $this->get('/oauth/google/callback')->assertNotFound();
        $this->get('/login')->assertOk()->assertDontSee('Continue with Google');
    }

    public function test_the_sign_in_page_offers_google_and_the_identity_provider(): void
    {
        $this->get('/login')->assertOk()->assertSee('Continue with Google')->assertSee(route('oauth.google.redirect'))->assertSee(route('oauth.redirect'));
    }

    public function test_a_new_verified_google_address_creates_a_google_only_account(): void
    {
        $this->google('google-sub-1', 'New.Player@Example.test', verified: true, name: 'New Player');

        $this->get('/oauth/google/callback')->assertRedirect('/');

        $user = User::query()->sole();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('new.player@example.test', $user->email);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNull($user->oauth_subject);
        $this->assertSame(SignInMethod::GOOGLE, session(SignInMethod::SESSION_KEY));
        $this->assertSame(['google-sub-1'], $user->identities()->pluck('subject')->all());
        $this->assertSame(['created_account' => true], AuthAuditLog::query()->where('event', AccessAudit::SIGN_IN_LINKED)->sole()->metadata);
    }

    public function test_a_verified_google_address_opens_the_account_that_confirmed_it(): void
    {
        $existing = $this->providerAccount('player@example.test', confirmed: true);
        $this->google('google-sub-2', 'Player@Example.test', verified: true);

        $this->get('/oauth/google/callback')->assertRedirect('/');

        $this->assertAuthenticatedAs($existing);
        $this->assertDatabaseCount('users', 1);
        $this->assertSame('google-sub-2', $existing->identities()->sole()->subject);
        $this->assertSame(['created_account' => false], AuthAuditLog::query()->where('event', AccessAudit::SIGN_IN_LINKED)->sole()->metadata);
        $this->get('/account')->assertOk()->assertSeeInOrder(['bherila ID', 'Google', '(player@example.test)']);
    }

    public function test_an_address_this_app_has_not_confirmed_is_never_taken_over(): void
    {
        // The identity provider does not verify addresses, so its account may carry one its
        // holder does not own. Only a confirmation here makes the address a key.
        $existing = $this->providerAccount('player@example.test', confirmed: false);
        $this->google('google-sub-3', 'player@example.test', verified: true);

        $this->get('/oauth/google/callback')->assertRedirect('/login')->assertSessionHas('error');

        $this->assertGuest();
        $this->assertDatabaseCount('user_identities', 0);
        $this->assertDatabaseCount('users', 1);
        $this->assertNull($existing->fresh()?->email_verified_at);
    }

    public function test_an_address_google_has_not_verified_is_refused(): void
    {
        $this->google('google-sub-4', 'someone@example.test', verified: false);

        $this->get('/oauth/google/callback')->assertRedirect('/login')->assertSessionHas('error');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_a_linked_google_account_keeps_its_account_after_either_address_changes(): void
    {
        $existing = $this->providerAccount('player@example.test', confirmed: true);
        $this->google('google-sub-5', 'player@example.test', verified: true);
        $this->get('/oauth/google/callback');
        $this->post('/logout');

        // The subject, not the address, finds the account once linked.
        $existing->forceFill(['email' => 'changed@example.test'])->save();
        $this->google('google-sub-5', 'renamed@example.test', verified: true);
        $this->get('/oauth/google/callback')->assertRedirect('/');

        $this->assertAuthenticatedAs($existing);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_a_second_google_account_with_the_same_address_is_not_linked(): void
    {
        $existing = $this->providerAccount('player@example.test', confirmed: true);
        $existing->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'first-google', 'email' => 'player@example.test']);
        $this->google('second-google', 'player@example.test', verified: true);

        $this->get('/oauth/google/callback')->assertRedirect('/login')->assertSessionHas('error', 'This Games account is already linked to a different Google account.');
        $this->assertGuest();
    }

    public function test_an_administrator_signed_in_with_google_must_sign_in_through_the_identity_provider_to_administer(): void
    {
        $admin = $this->providerAccount('admin@example.test', confirmed: true);
        $admin->forceFill(['is_admin' => true])->save();
        $this->google('google-admin', 'admin@example.test', verified: true);
        $this->get('/oauth/google/callback');
        $this->assertAuthenticatedAs($admin);

        $this->get('/admin')->assertRedirect(route('oauth.redirect'));
        $this->getJson('/api/admin/mandarin/audio')->assertForbidden();
        $this->get('/')->assertOk()->assertDontSee('data-testid="admin-link"', false);
    }

    public function test_a_remembered_administrator_session_steps_up_before_administering(): void
    {
        $admin = User::factory()->administrator()->create();

        // actingAs() alone is a session with no recorded sign-in method, as after a remember-me restore.
        $this->actingAs($admin)->get('/admin')->assertRedirect(route('oauth.redirect'));
        $this->actingThroughIdentityProvider($admin)->get('/admin')->assertOk();
    }

    public function test_signing_out_of_a_google_session_stays_local(): void
    {
        config(['bherila-auth.oauth_client.client_id' => 'games-client', 'bherila-auth.oauth_client.base_url' => 'https://identity.example.test']);
        $this->google('google-sub-6', 'leaver@example.test', verified: true);
        $this->get('/oauth/google/callback');

        $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
    }

    public function test_a_remembered_google_session_still_signs_out_locally(): void
    {
        config(['bherila-auth.oauth_client.client_id' => 'games-client', 'bherila-auth.oauth_client.base_url' => 'https://identity.example.test']);
        $this->google('google-sub-7', 'remembered@example.test', verified: true);
        $this->get('/oauth/google/callback');
        $player = User::query()->sole();

        // A remember-me restore: authenticated again, but with no recorded sign-in method.
        $this->flushSession();
        $this->actingAs($player)->post('/logout')->assertRedirect('/');
        $this->assertGuest();
    }

    private function providerAccount(string $email, bool $confirmed): User
    {
        $user = User::factory()->create(['email' => $email, 'email_verified_at' => $confirmed ? now() : null]);
        $user->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => "subject-for-{$email}"])->save();

        return $user;
    }

    private function google(string $subject, string $email, bool $verified, string $name = 'Google Player'): void
    {
        Socialite::fake('google', (new GoogleUser)
            ->setRaw(['sub' => $subject, 'email' => $email, 'email_verified' => $verified, 'name' => $name])
            ->map(['id' => $subject, 'email' => $email, 'name' => $name]));
    }
}
