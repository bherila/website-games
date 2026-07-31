<?php

namespace Tests\Feature;

use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionRolledBack;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class OAuthLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.identity_provider', [
            'name' => 'bherila',
            'base_url' => 'https://identity.example.test',
            'client_id' => 'games-client',
            'client_secret' => 'games-secret',
            'redirect_uri' => 'http://localhost/oauth/callback',
        ]);
    }

    public function test_home_page_has_an_explicit_sign_in_link(): void
    {
        $this->withoutVite();

        $this->get('/')
            ->assertOk()
            ->assertSee('Sign in')
            ->assertSee(route('oauth.redirect'));
    }

    public function test_sign_in_click_starts_authorization_code_flow_with_pkce(): void
    {
        $response = $this->get('/oauth/redirect');

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertIsString($location);
        $this->assertStringStartsWith('https://identity.example.test/oauth/authorize?', $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $this->assertSame('code', $query['response_type'] ?? null);
        $this->assertSame('S256', $query['code_challenge_method'] ?? null);
        $this->assertSame('identity:read', $query['scope'] ?? null);
        $this->assertArrayNotHasKey('prompt', $query);
        $this->assertSame(session('oauth.login.state'), $query['state'] ?? null);
        $this->assertNotSame('', session('oauth.login.code_verifier'));
    }

    public function test_callback_resolves_by_subject_and_refreshes_provider_profile(): void
    {
        $user = User::factory()->create([
            'name' => 'Old Name',
            'email' => 'old-address@example.test',
        ]);
        $user->forceFill([
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'provider-subject-42',
        ])->save();

        $this->fakeProvider('provider-subject-42', 'Updated Name', 'updated-address@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('users', [
            'id' => $user->getKey(),
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'provider-subject-42',
            'name' => 'Updated Name',
            'email' => 'updated-address@example.test',
        ]);
    }

    public function test_first_login_creates_a_subject_bound_account(): void
    {
        $this->fakeProvider('new-provider-subject', 'New Account', 'new-account@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $newUser = User::query()
            ->where('oauth_provider', 'bherila')
            ->where('oauth_subject', 'new-provider-subject')
            ->sole();

        $this->assertAuthenticatedAs($newUser);
        $this->assertNull($newUser->email_verified_at);
    }

    public function test_subject_resolution_is_case_sensitive(): void
    {
        $existingUser = User::factory()->create(['email' => 'upper-subject@example.test']);
        $existingUser->forceFill([
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'CaseSensitiveSubject',
        ])->save();
        $this->fakeProvider('casesensitivesubject', 'Different Account', 'lower-subject@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $newUser = User::query()
            ->where('oauth_subject', 'casesensitivesubject')
            ->sole();
        $this->assertAuthenticatedAs($newUser);
        $this->assertNotSame($existingUser->getKey(), $newUser->getKey());
        $this->assertDatabaseCount('users', 2);
    }

    public function test_refreshing_to_a_new_unverified_email_clears_previous_verification(): void
    {
        $user = User::factory()->create([
            'email' => 'verified-address@example.test',
            'email_verified_at' => now(),
        ]);
        $user->forceFill([
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'provider-subject-with-new-email',
        ])->save();
        $this->fakeProvider('provider-subject-with-new-email', 'Updated Name', 'unverified-address@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $this->assertNull($user->fresh()?->email_verified_at);
    }

    public function test_matching_email_never_rebinds_a_different_account(): void
    {
        $existingUser = User::factory()->create(['email' => 'reused-address@example.test']);
        $this->fakeProvider('different-provider-subject', 'Different Account', 'reused-address@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertConflict();

        $this->assertGuest();
        $this->assertNull($existingUser->fresh()?->oauth_subject);
        $this->assertDatabaseMissing('users', [
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'different-provider-subject',
        ]);
    }

    /**
     * The refusal above is correct but was silent, which is why the live failure took a
     * database inspection to explain. It now leaves a trail — carrying row ids only, never
     * the address or the subject, because this app's log is not a safe place for either.
     */
    public function test_an_unlinked_local_account_is_refused_with_a_redacted_explanation(): void
    {
        $existingUser = User::factory()->create(['email' => 'copied-account@example.test']);
        $this->fakeProvider('unlinked-provider-subject', 'Copied Account', 'copied-account@example.test');

        Log::shouldReceive('warning')
            ->once()
            ->withArgs(function (string $message, array $context) use ($existingUser): bool {
                $this->assertSame('OAuth sign-in could not be provisioned.', $message);
                $this->assertSame('bherila', $context['provider']);
                $this->assertNull($context['subject_bound_to']);
                $this->assertSame('users#'.$existingUser->getKey(), $context['email_held_by']);
                $this->assertFalse($context['email_holder_is_linked']);
                $this->assertStringContainsString('oauth:bind-subject', $context['reason']);

                $encoded = json_encode($context);
                $this->assertIsString($encoded);
                $this->assertStringNotContainsString('copied-account@example.test', $encoded);
                $this->assertStringNotContainsString('unlinked-provider-subject', $encoded);

                return true;
            });

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertConflict();

        $this->assertGuest();
    }

    /**
     * The end of the live failure: an account copied across from the provider's database
     * before OAuth existed, linked once by an operator, then signing in normally and
     * keeping the saved games it already owned.
     */
    public function test_an_account_signs_in_once_an_operator_has_linked_its_subject(): void
    {
        $copiedUser = User::factory()->create([
            'name' => 'Copied Account',
            'email' => 'copied-account@example.test',
        ]);
        $save = TowerSaveSlot::factory()->for($copiedUser)->create();

        $this->artisan('oauth:bind-subject', [
            'user' => $copiedUser->getKey(),
            'subject' => 'restored-provider-subject',
        ])->assertSuccessful();

        $this->fakeProvider('restored-provider-subject', 'Copied Account', 'copied-account@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $this->assertAuthenticatedAs($copiedUser);
        $this->assertDatabaseCount('users', 1);
        $this->assertSame($copiedUser->getKey(), $save->fresh()?->user_id);
    }

    /**
     * A second request for the same subject may lose the race to insert it. That is a
     * benign collision on the identity index, not the conflict above, and the loser should
     * simply adopt the row the winner created rather than refuse a legitimate sign-in.
     */
    public function test_a_lost_race_to_create_the_same_subject_adopts_the_winning_row(): void
    {
        $this->fakeProvider('raced-provider-subject', 'Raced Account', 'raced-account@example.test');

        $winnerAttributes = [
            'name' => 'Raced Account',
            'email' => 'raced-account@example.test',
            'email_verified_at' => now(),
            'password' => Hash::make('irrelevant'),
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'raced-provider-subject',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        /**
         * A real race runs on a second connection, which the test suite's single in-memory
         * database cannot provide. Its two observable effects are reproduced instead: the
         * competing row lands between this request's subject lookup and its insert, so the
         * insert collides; and being committed elsewhere, it is still there afterwards
         * rather than being taken down by this request's rollback.
         */
        $raced = false;
        DB::listen(function (QueryExecuted $query) use (&$raced, $winnerAttributes): void {
            if ($raced || ! str_starts_with($query->sql, 'select') || ! str_contains($query->sql, 'oauth_subject')) {
                return;
            }

            $raced = true;
            DB::table('users')->insert($winnerAttributes);
        });

        $survived = false;
        Event::listen(function (TransactionRolledBack $event) use (&$survived, $winnerAttributes): void {
            if ($survived) {
                return;
            }

            $survived = true;
            DB::table('users')->insert($winnerAttributes);
        });

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertRedirect('/');

        $this->assertTrue($raced, 'The competing row must land before the insert for this to test anything.');
        $this->assertTrue($survived, 'The insert must have collided and rolled back for this to test anything.');
        $winner = User::query()
            ->where('oauth_provider', 'bherila')
            ->where('oauth_subject', 'raced-provider-subject')
            ->sole();
        $this->assertAuthenticatedAs($winner);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_bound_account_is_not_logged_in_with_a_stale_profile_when_email_refresh_conflicts(): void
    {
        $boundUser = User::factory()->create(['email' => 'old-bound-address@example.test']);
        $boundUser->forceFill([
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'bound-provider-subject',
        ])->save();
        User::factory()->create(['email' => 'claimed-address@example.test']);
        $this->fakeProvider('bound-provider-subject', 'Updated Name', 'claimed-address@example.test');

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=authorization-code')
            ->assertConflict();

        $this->assertGuest();
        $this->assertSame('old-bound-address@example.test', $boundUser->fresh()?->email);
    }

    public function test_state_mismatch_is_rejected_before_contacting_the_provider(): void
    {
        Http::fake();

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=wrong-state&code=authorization-code')
            ->assertForbidden();

        $this->assertGuest();
        Http::assertNothingSent();
    }

    public function test_rejected_authorization_code_does_not_create_or_authenticate_an_account(): void
    {
        Http::fake([
            'https://identity.example.test/oauth/token' => Http::response([
                'error' => 'invalid_grant',
            ], 400),
        ]);

        $this->withSession($this->oauthSession())
            ->get('/oauth/callback?state=expected-state&code=rejected-code')
            ->assertStatus(502);

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
        Http::assertSentCount(1);
    }

    /**
     * @return array<string, string>
     */
    private function oauthSession(): array
    {
        return [
            'oauth.login.state' => 'expected-state',
            'oauth.login.code_verifier' => str_repeat('v', 64),
        ];
    }

    private function fakeProvider(string $subject, string $name, string $email): void
    {
        Http::fake(function (Request $request) use ($subject, $name, $email) {
            if ($request->url() === 'https://identity.example.test/oauth/token') {
                $this->assertSame('authorization_code', $request['grant_type']);
                $this->assertSame('authorization-code', $request['code']);
                $this->assertSame(str_repeat('v', 64), $request['code_verifier']);

                return Http::response(['access_token' => 'test-access-token'], 200);
            }

            if ($request->url() === 'https://identity.example.test/api/oauth/user') {
                $this->assertSame('Bearer test-access-token', $request->header('Authorization')[0] ?? null);

                return Http::response(['sub' => $subject, 'name' => $name, 'email' => $email], 200);
            }

            return Http::response([], 404);
        });
    }
}
