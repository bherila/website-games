<?php

namespace App\Services\Account;

use RuntimeException;

/** A merge that cannot be done safely; the message is safe to show the account holder. */
final class AccountMergeRefused extends RuntimeException
{
    public static function sameAccount(): self
    {
        return new self('That is already this account.');
    }

    public static function administrator(): self
    {
        return new self('The other account is an administrator, so it cannot be merged away.');
    }

    public static function bothUseIdentityProvider(): self
    {
        return new self('Both accounts sign in with bherila ID, and an account can have only one, so they cannot be merged.');
    }

    public static function addressMoved(): self
    {
        return new self('The other account no longer holds that address, so nothing was merged. Request a new confirmation link.');
    }

    public static function bothUseGoogle(): self
    {
        return new self('Both accounts are linked to a Google account, and an account can have only one, so they cannot be merged.');
    }
}
