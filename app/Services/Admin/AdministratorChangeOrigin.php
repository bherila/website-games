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
     * @param  array<string, mixed>  $metadata  extra audit metadata (the delegated request's `jti` and `operation_id`)
     * @param  ?string  $revocation  the audit `change` a revocation records, when not `administrator_revoked`
     */
    private function __construct(
        public readonly string $label,
        public readonly string $authMethod,
        public readonly ?User $actingUser,
        public readonly array $metadata,
        private readonly ?string $revocation = null,
    ) {}

    /** The `users:admin` command on the server. There is no acting account. */
    public static function console(): self
    {
        return new self('console', AccessAudit::METHOD_CONSOLE, null, []);
    }

    /**
     * An administrator acting from the identity provider's user-management page.
     *
     * `$operationId` is the provider's id for the user action, the same on every retry of it;
     * `$jti` is this one HTTP request's.
     */
    public static function delegated(User $actor, ?string $jti, ?string $operationId = null): self
    {
        return new self('delegated-access users#'.$actor->getKey(), AccessAudit::METHOD_DELEGATED, $actor, [
            'jti' => $jti,
            'operation_id' => $operationId,
        ]);
    }

    /**
     * An administrator removing an account's access from the identity provider's user-management
     * page. Here access is the administrator flag alone, so the removal is a revocation, recorded
     * as `access_removed` so the audit says which operation the provider asked for.
     */
    public static function delegatedRemoval(User $actor, ?string $jti, ?string $operationId): self
    {
        return new self('delegated-access users#'.$actor->getKey(), AccessAudit::METHOD_DELEGATED, $actor, [
            'jti' => $jti,
            'operation_id' => $operationId,
        ], 'access_removed');
    }

    /** The audit event for a grant (`true`) or a revocation (`false`) made from here. */
    public function event(bool $granted): string
    {
        if ($this->authMethod === AccessAudit::METHOD_DELEGATED) {
            return AccessAudit::DELEGATED_ACCESS_CHANGED;
        }

        return $granted ? AccessAudit::ADMIN_GRANTED : AccessAudit::ADMIN_REVOKED;
    }

    /** The audit `change` for a grant (`true`) or a revocation (`false`) made from here. */
    public function change(bool $granted): string
    {
        return $granted ? 'administrator_granted' : ($this->revocation ?? 'administrator_revoked');
    }
}
