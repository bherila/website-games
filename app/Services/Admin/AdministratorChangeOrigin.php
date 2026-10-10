<?php

namespace App\Services\Admin;

use App\Models\User;

/**
 * Who is changing the administrator flag, and how: what {@see ApplicationAdministrators} writes
 * to the log and to the audit row for the change.
 */
final class AdministratorChangeOrigin
{
    /**
     * @param  array<string, mixed>  $metadata  extra audit metadata (the delegated request's `jti`)
     */
    private function __construct(
        public readonly string $label,
        public readonly string $authMethod,
        public readonly ?User $actingUser,
        public readonly array $metadata,
    ) {}

    /** The `users:admin` command on the server. There is no acting account. */
    public static function console(): self
    {
        return new self('console', AccessAudit::METHOD_CONSOLE, null, []);
    }

    /** An administrator acting from the identity provider's user-management page. */
    public static function delegated(User $actor, ?string $jti): self
    {
        return new self('delegated-access users#'.$actor->getKey(), AccessAudit::METHOD_DELEGATED, $actor, ['jti' => $jti]);
    }

    /** The audit event for a grant (`true`) or a revocation (`false`) made from here. */
    public function event(bool $granted): string
    {
        if ($this->authMethod === AccessAudit::METHOD_DELEGATED) {
            return AccessAudit::DELEGATED_ACCESS_CHANGED;
        }

        return $granted ? AccessAudit::ADMIN_GRANTED : AccessAudit::ADMIN_REVOKED;
    }
}
