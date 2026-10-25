<?php

namespace App\Services\Privacy;

use App\Models\User;
use App\Notifications\PrivacyRequestAcknowledged;
use App\Notifications\PrivacyRequestReceived;
use Illuminate\Support\Facades\Notification;

/**
 * Privacy and accessibility requests from the public form. Nothing is stored: the request is
 * emailed to PRIVACY_CONTACT (never shown on the site) with the requester as reply-to, and the
 * requester gets an acknowledgement. The form only appears when mail can actually be delivered.
 */
final class PrivacyRequests
{
    /** Request types, in form order. Keys are stable; labels are what people see. */
    public const TOPICS = [
        'access' => 'Tell me what personal information you have about me',
        'correct' => 'Correct my personal information',
        'delete' => 'Delete my personal information',
        'opt-out' => 'Do not sell or share my personal information',
        'accessibility' => 'Report an accessibility problem or ask for help',
        'other' => 'Something else',
    ];

    /** Days within which a request is answered, as the California Consumer Privacy Act requires. */
    public const RESPONSE_DAYS = 45;

    public static function enabled(): bool
    {
        return filled(config('app.privacy_contact')) && ! in_array(config('mail.default'), ['log', 'array'], true);
    }

    public function submit(string $email, string $topic, string $message, ?User $user): void
    {
        Notification::route('mail', (string) config('app.privacy_contact'))
            ->notify(new PrivacyRequestReceived($email, $topic, $message, $user));
        Notification::route('mail', $email)->notify(new PrivacyRequestAcknowledged($topic));
    }
}
