<?php

namespace App\Services\Account;

use RuntimeException;

/** A confirmation link that cannot complete; the message is safe to show the account holder. */
final class EmailConfirmationFailed extends RuntimeException
{
    public static function invalid(): self
    {
        return new self('That confirmation link is not valid for this account. Request a new one below.');
    }

    public static function expired(): self
    {
        return new self('That confirmation link has expired. Request a new one below.');
    }

    public static function taken(): self
    {
        return new self('That address now belongs to another Games account, so it cannot be used here.');
    }
}
