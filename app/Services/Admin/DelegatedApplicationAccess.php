<?php

namespace App\Services\Admin;

use App\Models\User;
use BWH\Auth\OAuth\DelegatedAccess\ApplicationAccessAdapter;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedAccessException;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedAccessSettings;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedCursor;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRequestContext;
use BWH\Auth\OAuth\PendingAccount;
use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The application's half of delegated access: the identity provider's "Manage users" page asks,
 * this decides. The package has already verified who is asking and the request's shape.
 *
 * This application is account-only (contract version 3). There are no workspaces, so what can be
 * managed is whether a person has an account here (provisioning) and the application administrator
 * flag. Capabilities advertise no workspace roles, every access value carries `workspaces: []`,
 * and any update that names a membership is refused. `remove` therefore clears the flag and
 * nothing else: the account, its binding and its game data stay.
 *
 * Rules, all enforced here because the provider holds no authority of its own:
 *
 * - Only an administrator who can still sign in may use any operation, capabilities and listings
 *   included. The actor is matched on the sign-in binding (provider name + exact subject), never
 *   on an address. Everyone else gets `not_authorized`.
 * - The flag changes only through {@see ApplicationAdministrators}, which owns the
 *   last-administrator rule. An actor may not change their own flag (an actor is always an
 *   administrator, so that is self-demotion). Both are reported as
 *   `allowed_edits.application_admin: false` and refused again under the locks the change takes,
 *   where the revision is compared too. `allowed_edits.remove` follows the same answer, since the
 *   flag is all a removal takes; an account without the flag is a no-op removal, also allowed.
 * - Provisioning creates a row bound to the sign-in provider and the exact subject, with
 *   placeholder contact details. It never adopts an existing row, by address or otherwise, and a
 *   subject that is already bound is a `revision_conflict`. First sign-in then finds the row by
 *   that binding and fills in the real name and address, as it does for any returning account.
 * - Provisioning may create an administrator. The account is bound to the subject the provider
 *   asserted, so it is an administrator who can sign in, exactly what `users:admin grant` allows
 *   for a bound row; and the actor is an administrator who could grant the flag to that account
 *   one step later anyway. It goes through {@see ApplicationAdministrators::grant()} so the
 *   bootstrap rule, its audit row and its log entry still apply.
 *
 * Every change writes a row to the audit table through {@see AccessAudit}, in the transaction
 * that makes it, whatever the package's audit driver is set to: `account_provisioned` for a new
 * account and `delegated_access_changed` for the flag (written by ApplicationAdministrators; its
 * `change` is `access_removed` when a removal cleared it), all with auth_method `delegated`, the
 * actor as the acting account, the request's `jti` and the write's `operation_id` to correlate with
 * the provider's own records, and the state before and after. Provisioning an administrator
 * is two changes and writes both rows. An update or removal that changes nothing writes nothing. Each change
 * is also logged at info level. Rows and log lines carry row ids only: never an address, a
 * subject or a token.
 */
final class DelegatedApplicationAccess implements ApplicationAccessAdapter
{
    /** Shown until the first sign-in brings the real name. */
    private const PENDING_LABEL = 'Pending player';

    public function __construct(
        private readonly ApplicationAdministrators $administrators,
        private readonly DelegatedAccessSettings $settings,
        private readonly DelegatedCursor $cursor,
        private readonly Container $container,
        private readonly AccessAudit $accessAudit,
    ) {}

    public function handle(string $actorSubject, array $payload): array
    {
        $actor = $this->authorizedActor($actorSubject);

        return match ($payload['operation']) {
            'capabilities' => ['controls' => [
                'application_admin' => true,
                'workspace_roles' => [],
                'provisioning' => true,
            ]],
            'subjects' => $this->subjects($actorSubject, $payload),
            'workspaces' => ['workspaces' => [], 'next_cursor' => null],
            'read' => $this->state($actor, (string) $payload['subject'], $this->target((string) $payload['subject'])),
            'update' => $this->update($actor, $payload),
            'remove' => $this->remove($actor, $payload),
            default => throw DelegatedRefusal::of(DelegatedRefusal::INVALID_REQUEST),
        };
    }

    /**
     * The local account behind the verified actor, if it may manage access: bound under the
     * sign-in provider, an administrator, and able to sign in.
     *
     * @throws DelegatedAccessException not_authorized
     */
    private function authorizedActor(string $subject): User
    {
        $actor = $this->target($subject);

        if ($actor === null || ! $actor->isAdministrator() || ! $this->administrators->canSignIn($actor)) {
            throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
        }

        return $actor;
    }

    /** The account bound to this subject under the sign-in provider, the binding sign-in resolves. */
    private function target(string $subject, bool $lock = false): ?User
    {
        $provider = $this->settings->bindingIssuer();
        if ($provider === '') {
            return null;
        }

        $query = User::query()->where('oauth_provider', $provider)->where('oauth_subject', $subject);

        return ($lock ? $query->lockForUpdate() : $query)->first();
    }

    /**
     * Accounts that can be addressed by subject (bound under the sign-in provider), by row id,
     * optionally searched.
     *
     * A `query` is a case-insensitive substring of the name or the address. Placeholder addresses
     * (under `.invalid`, until first sign-in) are not addresses anyone has, so they never match.
     * A search is the unfiltered listing filtered, with the same keyset pages, and its cursor is
     * bound to it.
     *
     * @param  array<string, mixed>  $payload
     * @return array{subjects: list<array{subject: string, label: string}>, next_cursor: ?string}
     */
    private function subjects(string $actorSubject, array $payload): array
    {
        $limit = is_int($payload['limit'] ?? null) ? $payload['limit'] : 50;
        $search = is_string($payload['query'] ?? null) ? $payload['query'] : null;
        $after = $this->cursor->after($actorSubject, 'subjects', $payload);

        $query = User::query()
            ->where('oauth_provider', $this->settings->bindingIssuer())
            ->whereNotNull('oauth_subject')
            ->where('id', '>', $after);

        if ($search !== null) {
            $pattern = '%'.$this->likeEscaped(mb_strtolower($search, 'UTF-8')).'%';
            $query->where(fn (Builder $matching) => $matching
                ->whereRaw("LOWER(name) LIKE ? ESCAPE '!'", [$pattern])
                ->orWhere(fn (Builder $address) => $address
                    ->whereRaw("LOWER(email) LIKE ? ESCAPE '!'", [$pattern])
                    ->whereRaw("LOWER(email) NOT LIKE ? ESCAPE '!'", ['%@invalid'])));
        }

        $rows = $query->orderBy('id')->limit($limit + 1)->get(['id', 'name', 'oauth_subject']);

        $page = $rows->take($limit)->values();
        $last = $page->last();

        return [
            'subjects' => $page->map(fn (User $user): array => [
                'subject' => (string) $user->oauth_subject,
                'label' => $this->label($user),
            ])->all(),
            'next_cursor' => $rows->count() > $limit && $last !== null
                ? $this->cursor->encode($actorSubject, 'subjects', (int) $last->getKey(), $search)
                : null,
        ];
    }

    /** A LIKE operand matching `$value` literally, with `!` as the escape character on every driver. */
    private function likeEscaped(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function update(User $actor, array $payload): array
    {
        $subject = (string) $payload['subject'];
        /** @var array{application_admin: bool, workspaces: list<mixed>} $access */
        $access = $payload['access'];

        // No workspaces exist here, so no membership can be applied.
        if ($access['workspaces'] !== []) {
            throw DelegatedRefusal::of(DelegatedRefusal::INVALID_REQUEST);
        }

        if ($payload['expected_revision'] === null) {
            return $this->provision($actor, $subject, $access['application_admin'], $payload['display_name'] ?? null);
        }

        $wanted = $access['application_admin'];

        try {
            [$target, $change] = DB::transaction(function () use ($actor, $subject, $wanted, $payload): array {
                // Administrators first, then the target: the order every path takes. The actor's
                // authority, the revision and the last-administrator rule are all decided on
                // these locked rows, not on what the unlocked read before this saw.
                $administrators = $this->administrators->lockAdministrators();
                $actor = $administrators->firstWhere('id', $actor->getKey());
                if ($actor === null || ! $this->administrators->canSignIn($actor)) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
                }

                // A row that is gone, or no longer at the revision read, is a stale view.
                $target = $this->target($subject, lock: true);
                if ($target === null || ! hash_equals($this->revision($target), (string) $payload['expected_revision'])) {
                    throw DelegatedRefusal::of(DelegatedRefusal::REVISION_CONFLICT);
                }

                if ($target->isAdministrator() === $wanted) {
                    return [$target, null];
                }

                // An actor is always an administrator, so changing their own flag is demoting
                // themselves. Another administrator does that, never the actor.
                if ($target->is($actor)) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
                }

                $by = AdministratorChangeOrigin::delegated($actor, $this->jti(), $this->operationId());
                $changed = $wanted ? $this->administrators->grant($target, $by) : $this->administrators->revoke($target, $by);

                return [$target, $changed ? ($wanted ? 'administrator_granted' : 'administrator_revoked') : null];
            });
        } catch (AdministratorChangeRefused) {
            // The last administrator who can sign in, decided by the service under its locks.
            throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
        }

        if ($change !== null) {
            $this->log($change, $target, $actor);
        }

        return $this->state($actor, $subject, $target);
    }

    /**
     * Take away the subject's access here and nothing else: the administrator flag, which is all
     * the access this application manages. The account, its sign-in binding and its game data
     * stay, so `provisioned` stays true and a later grant or sign-in finds the same account.
     *
     * All or nothing, decided on the same locked rows as an update: the actor's own flag (that is
     * self-demotion) and the last administrator who can sign in are refused, and removing an
     * account that holds no flag is a no-op that keeps the revision and writes nothing.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function remove(User $actor, array $payload): array
    {
        $subject = (string) $payload['subject'];

        try {
            [$target, $changed] = DB::transaction(function () use ($actor, $subject, $payload): array {
                // The same order and the same decisions on locked rows as update().
                $administrators = $this->administrators->lockAdministrators();
                $actor = $administrators->firstWhere('id', $actor->getKey());
                if ($actor === null || ! $this->administrators->canSignIn($actor)) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
                }

                $target = $this->target($subject, lock: true);
                if ($target === null) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_PROVISIONED);
                }
                if (! hash_equals($this->revision($target), (string) $payload['expected_revision'])) {
                    throw DelegatedRefusal::of(DelegatedRefusal::REVISION_CONFLICT);
                }

                // Nothing to remove: the account stays exactly as it is, revision included.
                if (! $target->isAdministrator()) {
                    return [$target, false];
                }

                // An actor is always an administrator, so removing themselves is self-demotion.
                if ($target->is($actor)) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
                }

                $by = AdministratorChangeOrigin::delegatedRemoval($actor, $this->jti(), $this->operationId());

                return [$target, $this->administrators->revoke($target, $by)];
            });
        } catch (AdministratorChangeRefused) {
            // The last administrator who can sign in, decided by the service under its locks.
            throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
        }

        if ($changed) {
            $this->log('access_removed', $target, $actor);
        }

        return $this->state($actor, $subject, $target);
    }

    /**
     * Create the account for a subject this application has not seen, bound to it.
     *
     * @return array<string, mixed>
     */
    private function provision(User $actor, string $subject, bool $administrator, mixed $displayName): array
    {
        $provider = $this->settings->bindingIssuer();

        try {
            $target = DB::transaction(function () use ($actor, $subject, $administrator, $displayName, $provider): User {
                $administrators = $this->administrators->lockAdministrators();
                $actor = $administrators->firstWhere('id', $actor->getKey());
                if ($actor === null || ! $this->administrators->canSignIn($actor)) {
                    throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
                }

                // Provisioning never takes over an existing row: the binding is the only key,
                // and a bound subject already has its account.
                if ($this->target($subject, lock: true) !== null) {
                    throw DelegatedRefusal::of(DelegatedRefusal::REVISION_CONFLICT);
                }

                // The same shape sign-in creates, with placeholder contact details. The address
                // is under `.invalid`, deterministic in the binding, never mailed and never a
                // linking key. First sign-in resolves this row by its binding and replaces both.
                $target = User::query()->forceCreate([
                    'name' => is_string($displayName) && $displayName !== '' ? $displayName : PendingAccount::name(self::PENDING_LABEL, $subject),
                    'email' => PendingAccount::email($provider, $subject),
                    'email_verified_at' => null,
                    'password' => Hash::make(Str::random(64)),
                    'oauth_provider' => $provider,
                    'oauth_subject' => $subject,
                ]);

                $this->accessAudit->record(AccessAudit::ACCOUNT_PROVISIONED, $target, $actor, AccessAudit::METHOD_DELEGATED, [
                    'jti' => $this->jti(),
                    'operation_id' => $this->operationId(),
                    'change' => 'account_provisioned',
                    'before' => ['provisioned' => false],
                    'after' => ['provisioned' => true, 'application_admin' => false],
                    'application_admin_requested' => $administrator,
                ]);

                if ($administrator) {
                    $this->administrators->grant($target, AdministratorChangeOrigin::delegated($actor, $this->jti(), $this->operationId()));
                }

                return $target;
            });
        } catch (QueryException $exception) {
            // A concurrent sign-in or provisioning won the insert for this binding (or its
            // placeholder address). That row is the account; this request created nothing.
            if (in_array($exception->errorInfo[0] ?? null, ['23000', '23505'], true)) {
                throw DelegatedRefusal::of(DelegatedRefusal::REVISION_CONFLICT);
            }

            throw $exception;
        } catch (AdministratorChangeRefused) {
            throw DelegatedRefusal::of(DelegatedRefusal::NOT_AUTHORIZED);
        }

        $this->log('account_provisioned', $target, $actor, ['application_admin' => $target->isAdministrator()]);

        return $this->state($actor, $subject, $target);
    }

    /**
     * @return array<string, mixed>
     */
    private function state(User $actor, string $subject, ?User $target): array
    {
        if ($target === null) {
            return [
                'subject' => $subject,
                'provisioned' => false,
                'revision' => null,
                'access' => null,
                'allowed_edits' => ['application_admin' => false, 'workspaces' => false, 'provision' => true, 'remove' => false],
            ];
        }

        // The flag is the whole of the access here, so removal succeeds exactly when the flag may
        // be cleared, and is a no-op (still allowed) when it is not set: an account without the
        // flag is never the actor and never the last administrator, so it is editable too.
        $editable = $this->administratorEditable($actor, $target);

        return [
            'subject' => $subject,
            'provisioned' => true,
            'revision' => $this->revision($target),
            'access' => ['application_admin' => $target->isAdministrator(), 'workspaces' => []],
            'allowed_edits' => [
                'application_admin' => $editable,
                'workspaces' => false,
                'provision' => false,
                'remove' => $editable,
            ],
        ];
    }

    /**
     * Whether the actor may change this account's flag: never their own, and never the last
     * administrator who can sign in. Advisory; {@see update()} decides again under locks.
     */
    private function administratorEditable(User $actor, User $target): bool
    {
        return ! $target->is($actor) && $this->administrators->canRevoke($target);
    }

    /**
     * Everything an update changes or depends on for this row. The row id is in it, so a row
     * removed and provisioned again is a different revision.
     */
    private function revision(User $target): string
    {
        return hash('sha256', 'users|'.$target->getKey().'|'.($target->isAdministrator() ? 'admin' : 'player'));
    }

    private function label(User $user): string
    {
        $name = trim((string) $user->name);

        return $name === '' ? 'users#'.$user->getKey() : mb_strcut($name, 0, 255, 'UTF-8');
    }

    /** The verified request's `jti`, when the endpoint bound one. */
    private function jti(): ?string
    {
        return $this->container->bound(DelegatedRequestContext::class)
            ? $this->container->make(DelegatedRequestContext::class)->jti
            : null;
    }

    /** The provider's id for this write, the same on every retry of one user action. */
    private function operationId(): ?string
    {
        return $this->container->bound(DelegatedRequestContext::class)
            ? $this->container->make(DelegatedRequestContext::class)->operationId
            : null;
    }

    /**
     * @param  array<string, bool>  $detail
     */
    private function log(string $change, User $target, User $actor, array $detail = []): void
    {
        Log::info('Delegated access change.', [
            'change' => $change,
            'user' => 'users#'.$target->getKey(),
            'actor' => 'users#'.$actor->getKey(),
            'jti' => $this->jti(),
            'operation_id' => $this->operationId(),
            ...$detail,
        ]);
    }
}
