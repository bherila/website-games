<?php

namespace Tests\Feature;

use App\Http\Controllers\GoogleLoginController;
use App\Models\User;
use App\Models\UserIdentity;
use BWH\Auth\Http\Middleware\RequireActiveProviderSession;
use BWH\Auth\OAuth\Session\ProviderIdentityEnforcement;
use BWH\Auth\OAuth\Session\ProviderIdentityStatusClient;
use BWH\Auth\OAuth\Session\RememberedProviderLogins;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use PHPUnit\Framework\Attributes\CoversClass;
use Tests\TestCase;

/**
 * Provider identity enforcement in games (docs/provider-identity.md): once on, a session whose
 * identity the provider has ended is signed out, however it signed in: through bherila ID,
 * through Google for an account bound to bherila ID, or restored from the remember-me cookie.
 * Google-only accounts are not the provider's to end.
 */
#[CoversClass(GoogleLoginController::class)]
#[CoversClass(RequireActiveProviderSession::class)]
final class ProviderIdentityTest extends TestCase
{
    use RefreshDatabase;

    private const STATUS_URL = 'https://identity.example.test/api/reconciliation/identity-status';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Config::set('bherila-auth.oauth_client', [
            'provider' => 'bherila',
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
        config([
            'services.google.client_id' => 'google-client',
            'services.google.client_secret' => 'google-secret',
            'bherila-auth.provider_identity.enabled' => true,
        ]);
        $this->travelTo(Carbon::parse('2026-11-23T12:00:00Z'));
        Http::preventStrayRequests();
    }

    private function bound(string $subject = 'subject-player'): User
    {
        $user = User::factory()->create(['email' => "{$subject}@example.test", 'email_verified_at' => now()]);
        $user->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => $subject])->save();

        return $user;
    }

    private bool $providerActive = true;

    private int $providerGeneration = 3;

    private bool $providerFaked = false;

    /**
     * The provider answers for every subject: active at $generation, or ended. Faked once and
     * read on each request, because a later Http::fake() only appends a stub the first one
     * still shadows.
     */
    private function provider(bool $active = true, int $generation = 3): void
    {
        $this->providerActive = $active;
        $this->providerGeneration = $generation;
        if ($this->providerFaked) {
            return;
        }
        $this->providerFaked = true;
        Http::fake([self::STATUS_URL => fn (Request $request) => Http::response($this->providerActive
            ? ['contract_version' => 1, 'active' => true, 'subject' => $request['subject'], 'credential_version' => $this->providerGeneration]
            : ['contract_version' => 1, 'active' => false])]);
    }

    /** The baseline a bherila ID sign-in under $generation leaves in the session. */
    private function signedInThroughProvider(User $user, int $generation = 3): static
    {
        return $this->actingAs($user)->withSession(['bherila_auth.provider_session' => [
            'context' => app(ProviderIdentityStatusClient::class)->context(),
            'provider' => 'bherila',
            'subject' => (string) $user->oauth_subject,
            'generation' => $generation,
            'checked_at' => 0,
            'name' => (string) $user->name,
            'email' => (string) $user->email,
        ]]);
    }

    private function googleSignIn(User $user): TestResponse
    {
        $user->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'google-'.$user->getKey(), 'email' => $user->email]);
        Socialite::fake('google', (new GoogleUser)
            ->setRaw(['sub' => 'google-'.$user->getKey(), 'email' => $user->email, 'email_verified' => true, 'name' => 'Player'])
            ->map(['id' => 'google-'.$user->getKey(), 'email' => $user->email, 'name' => 'Player']));

        return $this->get('/oauth/google/callback');
    }

    private function newBrowser(): void
    {
        $this->flushSession();
        Auth::forgetGuards();
        $this->defaultCookies = [];
    }

    public function test_an_ended_identity_is_signed_out_of_pages_and_of_the_save_api(): void
    {
        $this->provider(active: false);

        $this->signedInThroughProvider($this->bound())->get('/account')->assertRedirect(route('login'));
        $this->assertGuest();

        $this->signedInThroughProvider($this->bound('subject-api'))->getJson('/api/games/data')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Your sign-in has ended. Sign in again.');
    }

    public function test_an_active_identity_keeps_its_session(): void
    {
        $this->provider();

        $this->signedInThroughProvider($this->bound())->get('/account')->assertOk();
        $this->assertAuthenticated();
    }

    public function test_a_google_only_account_is_never_asked_about(): void
    {
        $this->provider(active: false);

        // Fresh from the database, as a real request loads it: the binding columns are present.
        $this->actingAs(User::factory()->create()->fresh())->get('/account')->assertOk();
        Http::assertNothingSent();
    }

    public function test_signing_out_stays_reachable_while_the_provider_is_unavailable(): void
    {
        Http::fake([self::STATUS_URL => Http::response('', 503)]);
        $user = $this->bound();

        $this->signedInThroughProvider($user)->get('/account')->assertStatus(503);
        $this->signedInThroughProvider($user)->post('/logout')->assertRedirect();
        $this->assertGuest();
    }

    public function test_google_sign_in_of_a_bound_account_is_checked_from_then_on(): void
    {
        $this->provider(generation: 3);
        $user = $this->bound();

        $this->googleSignIn($user)->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertSame(3, session('bherila_auth.provider_session.generation'));
        $this->assertSame(3, (int) DB::table(RememberedProviderLogins::TABLE)->where('user_id', (string) $user->getKey())->value('generation'));
        $this->get('/account')->assertOk();

        // The player resets their bherila ID password: the Google session ends with it.
        $this->provider(generation: 4);
        $this->travel(5)->minutes();
        $this->get('/account')->assertRedirect(route('login'));
        $this->assertGuest();
    }

    public function test_google_cannot_bring_back_an_identity_the_provider_has_ended(): void
    {
        $this->provider(active: false);

        $this->googleSignIn($this->bound())->assertRedirect(route('login'))->assertSessionHas('error');
        $this->assertGuest();
    }

    public function test_google_sign_in_of_a_bound_account_waits_for_an_unavailable_provider(): void
    {
        Http::fake([self::STATUS_URL => Http::response('', 503)]);

        $this->googleSignIn($this->bound())->assertStatus(503);
        $this->assertGuest();
    }

    public function test_with_enforcement_off_google_sign_in_proceeds_whatever_the_provider_says(): void
    {
        config(['bherila-auth.provider_identity.enabled' => false]);
        Http::fake([self::STATUS_URL => Http::response('', 503)]);
        $user = $this->bound();

        $this->googleSignIn($user)->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_a_session_restored_from_the_remember_me_cookie_is_still_checked(): void
    {
        $this->provider(generation: 3);
        $user = $this->bound();
        $cookieName = Auth::guard()->getRecallerName();
        $cookie = $this->googleSignIn($user)->getCookie($cookieName);
        $this->assertNotNull($cookie);
        $this->newBrowser();

        // A later visit, after the browser session ended: the cookie signs the player back in.
        $this->travel(3)->hours();
        $this->withCookie($cookieName, $cookie->getValue())->get('/account')->assertOk();
        $this->assertAuthenticatedAs($user);
        $this->newBrowser();

        // The player's bherila ID is disabled: the cookie no longer keeps them signed in.
        $this->provider(active: false);
        $this->travel(3)->hours();
        $this->withCookie($cookieName, $cookie->getValue())->get('/account')->assertRedirect(route('login'));
        $this->assertGuest();
    }

    public function test_a_recorded_cutover_keeps_enforcement_on_and_fails_a_drifted_deploy(): void
    {
        $this->artisan('bherila-auth:provider-identity-cutover', ['action' => 'record'])->assertSuccessful();
        $this->artisan('bherila-auth:provider-identity-cutover', ['action' => 'check'])->assertSuccessful();

        config(['bherila-auth.provider_identity.enabled' => false]);
        $this->assertTrue(app(ProviderIdentityEnforcement::class)->enabled());
        $this->artisan('bherila-auth:provider-identity-cutover', ['action' => 'check'])->assertFailed();

        $this->provider(active: false);
        $this->signedInThroughProvider($this->bound())->get('/account')->assertRedirect(route('login'));
    }

    public function test_every_signed_in_route_runs_in_the_web_group_and_so_is_enforced(): void
    {
        $outside = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn (Route $route): bool => in_array('auth', $route->gatherMiddleware(), true)
                && ! in_array('web', $route->gatherMiddleware(), true))
            ->map(fn (Route $route): string => $route->uri())
            ->values()->all();

        $this->assertSame([], $outside, 'RequireActiveProviderSession is appended to the web group (bootstrap/app.php).');
    }

    public function test_nothing_is_recorded_by_default(): void
    {
        config(['bherila-auth.provider_identity.enabled' => false]);

        $this->assertFalse(app(ProviderIdentityEnforcement::class)->enabled());
        $this->artisan('bherila-auth:provider-identity-cutover', ['action' => 'check'])->assertSuccessful();
    }
}
