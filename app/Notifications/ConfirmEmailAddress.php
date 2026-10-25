<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the address being confirmed; the link completes the change. */
class ConfirmEmailAddress extends Notification
{
    public function __construct(private readonly string $url, private readonly bool $changing) {}

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
            ->subject($this->changing ? 'Confirm your new email for Games' : 'Confirm your email for Games')
            ->line($this->changing
                ? 'Someone asked to use this address for their Games account. Confirm it to finish the change.'
                : 'Confirm this address to finish setting up your Games account.')
            ->action('Confirm email', $this->url)
            ->line('The link works for 60 minutes. If you did not ask for this, ignore this email; nothing changes.');
    }
}
