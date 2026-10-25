<?php

namespace Tests\Feature\Privacy;

use App\Models\User;
use App\Notifications\PrivacyRequestAcknowledged;
use App\Notifications\PrivacyRequestReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PrivacyRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Notification::fake();
        config(['app.privacy_contact' => 'owner@example.test', 'mail.default' => 'smtp']);
    }

    public function test_the_form_appears_only_when_mail_can_be_delivered_and_never_shows_the_contact_address(): void
    {
        $this->get('/privacy')->assertOk()->assertSee('Send request')->assertDontSee('owner@example.test');

        config(['mail.default' => 'log']);
        $this->get('/privacy')->assertOk()->assertDontSee('Send request')->assertSee('Account page');
        $this->post('/privacy/request', ['email' => 'a@example.test', 'topic' => 'access'])->assertNotFound();

        config(['mail.default' => 'smtp', 'app.privacy_contact' => null]);
        $this->get('/privacy')->assertOk()->assertDontSee('Send request');
    }

    public function test_a_request_reaches_the_contact_with_the_requester_as_reply_to_and_is_acknowledged(): void
    {
        $this->post('/privacy/request', ['email' => 'player@example.test', 'topic' => 'delete', 'message' => 'Please delete my data.', 'return' => 'privacy'])
            ->assertRedirect(route('privacy').'#request')
            ->assertSessionHas('privacy_request_sent', true);

        Notification::assertSentOnDemand(PrivacyRequestReceived::class, function (PrivacyRequestReceived $notification, array $channels, AnonymousNotifiable $notifiable): bool {
            $mail = $notification->toMail($notifiable);

            return $notifiable->routes['mail'] === 'owner@example.test'
                && $mail->replyTo === [['player@example.test', null]]
                && in_array('Message:', $mail->introLines, true)
                && in_array('Please delete my data.', $mail->introLines, true)
                && str_contains(implode(' ', $mail->introLines), 'Not signed in');
        });
        Notification::assertSentOnDemand(PrivacyRequestAcknowledged::class, fn ($notification, $channels, AnonymousNotifiable $notifiable): bool => $notifiable->routes['mail'] === 'player@example.test');
    }

    public function test_a_signed_in_request_names_the_account_for_verification(): void
    {
        $user = User::factory()->create(['email' => 'member@example.test']);

        $this->actingAs($user)->post('/privacy/request', ['email' => 'member@example.test', 'topic' => 'access']);

        Notification::assertSentOnDemand(PrivacyRequestReceived::class, fn (PrivacyRequestReceived $notification, $channels, AnonymousNotifiable $notifiable): bool => str_contains(implode(' ', $notification->toMail($notifiable)->introLines), "users#{$user->getKey()}")
            && str_contains(implode(' ', $notification->toMail($notifiable)->introLines), 'matches the account'));
    }

    public function test_the_hidden_field_turns_bots_away_without_telling_them(): void
    {
        $this->post('/privacy/request', ['email' => 'bot@example.test', 'topic' => 'other', 'website' => 'http://spam.example'])
            ->assertSessionHas('privacy_request_sent', true);

        Notification::assertNothingSent();
    }

    public function test_invalid_fields_are_reported_on_the_field_for_assistive_technology(): void
    {
        $this->from('/privacy')->post('/privacy/request', ['email' => 'not-an-address', 'topic' => 'nonsense'])
            ->assertSessionHasErrors(['email', 'topic']);

        $this->followingRedirects()->from('/privacy')->post('/privacy/request', ['email' => 'not-an-address', 'topic' => 'access'])
            ->assertSee('aria-invalid="true"', false)
            ->assertSee('aria-describedby="request-email-error"', false)
            ->assertSee('id="request-email-error"', false);
        Notification::assertNothingSent();
    }

    public function test_requests_are_limited_per_address_and_per_ip(): void
    {
        foreach (range(1, 3) as $attempt) {
            $this->post('/privacy/request', ['email' => 'repeat@example.test', 'topic' => 'other'])->assertRedirect();
        }
        $this->post('/privacy/request', ['email' => 'repeat@example.test', 'topic' => 'other'])->assertTooManyRequests();

        $this->post('/privacy/request', ['email' => 'fourth@example.test', 'topic' => 'other'])->assertRedirect();
        $this->post('/privacy/request', ['email' => 'fifth@example.test', 'topic' => 'other'])->assertRedirect();
        $this->post('/privacy/request', ['email' => 'sixth@example.test', 'topic' => 'other'])->assertTooManyRequests();
    }

    public function test_the_accessibility_page_offers_feedback_preselected_and_both_pages_cover_the_required_notices(): void
    {
        $this->get('/accessibility')->assertOk()
            ->assertSee('WCAG')
            ->assertSee('<option value="accessibility" selected', false)
            ->assertSee('value="accessibility"', false);

        $this->get('/privacy')->assertOk()
            ->assertSee('Notice at collection')
            ->assertSee('Global Privacy Control')
            ->assertSee('Do Not Sell or Share')
            ->assertSee('authorized agent')
            ->assertSee('45 days')
            ->assertSee('No discrimination', false);

        foreach (['/', '/login', '/privacy', '/accessibility'] as $page) {
            $this->get($page)->assertOk()->assertSee(route('privacy'))->assertSee(route('accessibility'));
        }
    }
}
