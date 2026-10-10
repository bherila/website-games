<?php

namespace App\Services\Admin;

use App\Models\User;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * The durable record of every change to who has an account here and who administers the
 * application, and of every paid action an administrator takes from the admin dashboard: one row
 * in the auth package's audit table (`bherila-auth.audit.table`) per change.
 *
 * The row is written directly, whatever `bherila-auth.audit.driver` says. That driver decides
 * whether the package records sign-in events; it is not allowed to switch off the record of an
 * access change.
 *
 * {@see record()} must run inside the transaction that makes the change, so a change and its row
 * commit together or not at all: a failed insert rolls the change back. It refuses to run outside
 * one rather than write a row for a change that might still fail, or a change without its row.
 *
 * Rows carry row ids and the request's `jti`, never an address, a subject or a token.
 */
final class AccessAudit
{
    /** `users:admin grant` (auth_method `console`). */
    public const ADMIN_GRANTED = 'application_admin_granted';

    /** `users:admin revoke` (auth_method `console`). */
    public const ADMIN_REVOKED = 'application_admin_revoked';

    /** The administrator flag changed through delegated access (auth_method `delegated`). */
    public const DELEGATED_ACCESS_CHANGED = 'delegated_access_changed';

    /** An account was created for a subject through delegated access (auth_method `delegated`). */
    public const ACCOUNT_PROVISIONED = 'account_provisioned';

    /**
     * An administrator queued paid audio generation from the admin dashboard (auth_method
     * `session`). Not an access change, but money spent on an operator's say-so belongs in the
     * same record. `user_id` and `acting_user_id` are both the administrator.
     */
    public const MANDARIN_AUDIO_REQUESTED = 'mandarin_audio_requested';

    public const METHOD_CONSOLE = 'console';

    public const METHOD_DELEGATED = 'delegated';

    /** A signed-in administrator's browser session. */
    public const METHOD_SESSION = 'session';

    /**
     * @param  array<string, mixed>  $metadata
     *
     * @throws LogicException when no transaction is open
     */
    public function record(string $event, User $target, ?User $actingUser, string $authMethod, array $metadata): AuthAuditLog
    {
        if (DB::connection((new AuthAuditLog)->getConnectionName())->transactionLevel() === 0) {
            throw new LogicException('An access change is audited inside the transaction that makes it.');
        }

        $row = new AuthAuditLog;
        $row->forceFill([
            'user_id' => $target->getKey(),
            'acting_user_id' => $actingUser?->getKey(),
            'event' => $event,
            'auth_method' => $authMethod,
            'succeeded' => true,
            'metadata' => $metadata,
        ])->save();

        return $row;
    }
}
