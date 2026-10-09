<?php

namespace App\Services\Admin;

use App\Models\User;
use RuntimeException;

/**
 * A grant or revocation of application administrator that {@see ApplicationAdministrators}
 * refused. The message names rows by id only, never by address or subject, so it is safe to
 * show an operator and to log.
 */
final class AdministratorChangeRefused extends RuntimeException
{
    public const LAST_ADMINISTRATOR = 'last_administrator';

    public const CANNOT_SIGN_IN = 'cannot_sign_in';

    public const PROVIDER_UNKNOWN = 'provider_unknown';

    private function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }

    public static function lastAdministrator(User $user): self
    {
        return new self(self::LAST_ADMINISTRATOR, sprintf(
            'users#%s is the last administrator who can sign in. Grant another administrator first.',
            $user->getKey(),
        ));
    }

    public static function cannotSignIn(User $user): self
    {
        return new self(self::CANNOT_SIGN_IN, sprintf(
            'users#%s has no identity-provider subject bound, so it cannot sign in. Link it with oauth:bind-subject first.',
            $user->getKey(),
        ));
    }

    public static function providerUnknown(): self
    {
        return new self(
            self::PROVIDER_UNKNOWN,
            'The identity provider is not configured, so it is not possible to tell which administrators can sign in.',
        );
    }
}
