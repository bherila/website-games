<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the previous address after a change, so a change the owner did not make is noticed. */
class EmailAddressChanged extends Notification
{
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
            ->subject('Your Games email was changed')
            ->line('The email on your Games account was just changed to a different address.')
            ->line('If you did not do this, sign in the way you usually do and change it back from your account page.');
    }
}
