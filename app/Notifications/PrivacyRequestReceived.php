<?php

namespace App\Notifications;

use App\Models\User;
use App\Services\Privacy\PrivacyRequests;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the privacy contact. Replying answers the requester directly. */
class PrivacyRequestReceived extends Notification
{
    public function __construct(
        private readonly string $email,
        private readonly string $topic,
        private readonly string $message,
        private readonly ?User $user,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $account = $this->user === null
            ? 'Not signed in. Verify the requester before acting on an access, correction or deletion request.'
            : sprintf('Signed in as users#%d (%s). %s', $this->user->getKey(), $this->user->email, strcasecmp($this->user->email, $this->email) === 0 ? 'The reply-to address matches the account.' : 'The reply-to address differs from the account email.');

        return (new MailMessage)
            ->subject('Games privacy request: '.PrivacyRequests::TOPICS[$this->topic])
            ->replyTo($this->email)
            ->line('Request: '.PrivacyRequests::TOPICS[$this->topic])
            ->line('From: '.$this->email)
            ->line('Account: '.$account)
            ->line('Message:')
            ->line($this->message !== '' ? $this->message : '(none)')
            ->line('Respond within '.PrivacyRequests::RESPONSE_DAYS.' days.');
    }
}
