<?php

namespace Tests\Feature\Account;

use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Notifications\ConfirmEmailAddress;
use App\Notifications\EmailAddressChanged;
use App\Services\Admin\AccessAudit;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;
use Tests\TestCase;

class AccountEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Notification::fake();
    }

    public function test_the_account_page_requires_sign_in(): void
    {
        $this->get('/account')->assertRedirect('/login');
    }

    public function test_a_new_address_is_only_used_once_its_emailed_link_is_opened(): void
    {
        $user = User::factory()->create(['email' => 'old@example.test']);

        $this->actingAs($user)->post('/account/email', ['email' => ' New@Example.test '])
            ->assertRedirect('/account')
            ->assertSessionHas('status');

        $this->assertSame('old@example.test', $user->fresh()?->email);
        $token = $this->tokenSentTo('new@example.test');
        // Only a digest is stored, so the table alone cannot complete a change.
        $this->assertSame(hash('sha256', $token), EmailChangeRequest::query()->sole()->token_hash);
        $this->assertDatabaseMissing('email_change_requests', ['token_hash' => $token]);

        $this->actingAs($user)->get("/account/email/confirm/{$token}")
            ->assertRedirect('/account')
            ->assertSessionHas('status', 'Your email is confirmed.');

        $fresh = $user->fresh();
        $this->assertSame('new@example.test', $fresh?->email);
        $this->assertNotNull($fresh?->email_verified_at);
        $this->assertDatabaseCount('email_change_requests', 0);
        $this->assertSame([AccessAudit::EMAIL_CHANGED], AuthAuditLog::query()->pluck('event')->all());
        Notification::assertSentOnDemand(EmailAddressChanged::class, fn ($notification, $channels, AnonymousNotifiable $notifiable): bool => $notifiable->routes['mail'] === 'old@example.test');
    }

    public function test_a_link_only_works_for_the_account_that_asked_for_it(): void
    {
        $owner = User::factory()->create(['email' => 'owner@example.test']);
        $other = User::factory()->create(['email' => 'other@example.test']);
        $this->actingAs($owner)->post('/account/email', ['email' => 'wanted@example.test']);
        $token = $this->tokenSentTo('wanted@example.test');

        $this->actingAs($other)->get("/account/email/confirm/{$token}")
            ->assertRedirect('/account')
            ->assertSessionHas('error');

        $this->assertSame('other@example.test', $other->fresh()?->email);
        $this->assertSame('owner@example.test', $owner->fresh()?->email);
        $this->assertDatabaseCount('email_change_requests', 1);
    }

    public function test_an_expired_link_changes_nothing(): void
    {
        $user = User::factory()->create(['email' => 'old@example.test']);
        $this->actingAs($user)->post('/account/email', ['email' => 'late@example.test']);
        $token = $this->tokenSentTo('late@example.test');

        $this->travel(61)->minutes();
        $this->actingAs($user)->get("/account/email/confirm/{$token}")->assertSessionHas('error');

        $this->assertSame('old@example.test', $user->fresh()?->email);
        $this->assertDatabaseCount('email_change_requests', 0);
    }

    public function test_a_newer_request_replaces_the_earlier_link(): void
    {
        $user = User::factory()->create(['email' => 'old@example.test']);
        $this->actingAs($user)->post('/account/email', ['email' => 'first@example.test']);
        $first = $this->tokenSentTo('first@example.test');
        $this->actingAs($user)->post('/account/email', ['email' => 'second@example.test']);

        $this->actingAs($user)->get("/account/email/confirm/{$first}")->assertSessionHas('error');
        $this->assertSame('old@example.test', $user->fresh()?->email);

        $this->actingAs($user)->get('/account/email/confirm/'.$this->tokenSentTo('second@example.test'))->assertSessionHas('status');
        $this->assertSame('second@example.test', $user->fresh()?->email);
    }

    public function test_an_address_held_by_another_account_is_refused_only_after_its_link_is_opened(): void
    {
        $user = User::factory()->create(['email' => 'mine@example.test']);
        User::factory()->create(['email' => 'Taken@example.test']);

        // Asking reveals nothing: the response is the same as for a free address.
        $this->actingAs($user)->post('/account/email', ['email' => 'taken@example.test'])
            ->assertSessionHas('status', 'We sent a confirmation link to taken@example.test. It works for 60 minutes.');

        $this->actingAs($user)->get('/account/email/confirm/'.$this->tokenSentTo('taken@example.test'))
            ->assertSessionHas('error', 'That address now belongs to another Games account, so it cannot be used here.');
        $this->assertSame('mine@example.test', $user->fresh()?->email);
    }

    public function test_confirming_the_current_address_verifies_it_without_a_change_notice(): void
    {
        $user = User::factory()->create(['email' => 'same@example.test', 'email_verified_at' => null]);

        $this->actingAs($user)->get('/account')->assertOk()->assertSee('Not confirmed')->assertSee('Send confirmation email');
        $this->actingAs($user)->post('/account/email', ['email' => 'same@example.test']);
        $this->actingAs($user)->get('/account/email/confirm/'.$this->tokenSentTo('same@example.test'))->assertSessionHas('status');

        $this->assertNotNull($user->fresh()?->email_verified_at);
        $this->assertSame([AccessAudit::EMAIL_VERIFIED], AuthAuditLog::query()->pluck('event')->all());
        Notification::assertNotSentTo(new AnonymousNotifiable, EmailAddressChanged::class);
        Notification::assertSentOnDemandTimes(EmailAddressChanged::class, 0);
    }

    public function test_an_already_confirmed_current_address_sends_nothing(): void
    {
        $user = User::factory()->create(['email' => 'done@example.test', 'email_verified_at' => now()]);

        $this->actingAs($user)->post('/account/email', ['email' => 'done@example.test'])
            ->assertSessionHas('status', 'That address is already confirmed.');
        Notification::assertNothingSent();
    }

    public function test_requests_are_rate_limited_per_account(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 5) as $attempt) {
            $this->actingAs($user)->post('/account/email', ['email' => "try{$attempt}@example.test"])->assertRedirect();
        }

        $this->actingAs($user)->post('/account/email', ['email' => 'try6@example.test'])->assertTooManyRequests();
    }

    public function test_the_home_page_links_to_the_account_and_flags_an_unconfirmed_email(): void
    {
        $user = User::factory()->create(['email_verified_at' => null]);

        $this->actingAs($user)->get('/')->assertOk()->assertSee('data-testid="account-link"', false)->assertSee('Confirm email');
        $user->forceFill(['email_verified_at' => now()])->save();
        $this->actingAs($user)->get('/')->assertOk()->assertDontSee('Confirm email');
    }

    public function test_the_brevo_mailer_sends_through_the_brevo_api(): void
    {
        config(['services.brevo.dsn' => 'brevo+api://test-key@default']);

        $this->assertInstanceOf(BrevoApiTransport::class, Mail::mailer('brevo')->getSymfonyTransport());
    }

    private function tokenSentTo(string $address): string
    {
        $url = null;
        Notification::assertSentOnDemand(ConfirmEmailAddress::class, function (ConfirmEmailAddress $notification, array $channels, AnonymousNotifiable $notifiable) use ($address, &$url): bool {
            if ($notifiable->routes['mail'] !== $address) {
                return false;
            }
            $url = $notification->toMail($notifiable)->actionUrl;

            return true;
        });
        $this->assertIsString($url);

        return basename((string) parse_url($url, PHP_URL_PATH));
    }
}
