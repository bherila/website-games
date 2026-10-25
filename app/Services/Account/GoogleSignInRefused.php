<?php

namespace App\Services\Account;

use RuntimeException;

/** A Google sign-in that cannot open an account; the message is safe to show the person. */
final class GoogleSignInRefused extends RuntimeException
{
    public static function unverifiedEmail(): self
    {
        return new self('Google has not verified the email on that Google account, so it cannot be used to sign in here.');
    }

    /**
     * Only the owner of the Google account sees this, and Google has verified they hold the
     * address, so saying an account exists for it reveals nothing to anyone else.
     */
    public static function unconfirmedAccount(): self
    {
        return new self('A Games account already uses this email but has not confirmed it. Sign in with bherila ID, confirm your email on the Account page, then Google sign-in will open that account.');
    }

    public static function alreadyLinked(): self
    {
        return new self('This Games account is already linked to a different Google account.');
    }
}
