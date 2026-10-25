<?php

namespace App\Notifications;

use App\Services\Privacy\PrivacyRequests;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Confirms receipt to the requester, with what happens next. */
class PrivacyRequestAcknowledged extends Notification
{
    public function __construct(private readonly string $topic) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('We received your request to BWH Games')
            ->line('We received your request: '.PrivacyRequests::TOPICS[$this->topic].'.')
            ->line('We will reply to this address within '.PrivacyRequests::RESPONSE_DAYS.' days. For requests about personal information, we may ask you to confirm you own the account, for example by signing in.')
            ->line('If you did not send this, you can ignore this email.');
    }
}
