<?php

namespace App\Services\Account;

use Illuminate\Contracts\Session\Session;

/**
 * How the current session was signed in. Administrator rights need a sign-in through the
 * identity provider in this session, because a Google sign-in can reach any account whose
 * confirmed address it matches. A session restored from the remember-me cookie records no
 * method, so an administrator is sent through the identity provider again before acting.
 */
final class SignInMethod
{
    public const IDENTITY_PROVIDER = 'identity-provider';

    public const GOOGLE = 'google';

    public const SESSION_KEY = 'auth.sign_in_method';

    public static function remember(Session $session, string $method): void
    {
        $session->put(self::SESSION_KEY, $method);
    }

    public static function current(?Session $session): ?string
    {
        $method = $session?->get(self::SESSION_KEY);

        return is_string($method) ? $method : null;
    }

    public static function viaIdentityProvider(?Session $session): bool
    {
        return self::current($session) === self::IDENTITY_PROVIDER;
    }
}
