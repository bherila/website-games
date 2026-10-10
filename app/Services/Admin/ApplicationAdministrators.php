<?php

namespace App\Services\Admin;

use App\Models\User;
use BWH\Auth\OAuth\OAuthClient;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * The one place application-administrator status changes, and the rule it keeps.
 *
 * Rule: the app never loses its last administrator who can still sign in. An administrator
 * "can sign in" when the account is bound to a subject under the configured identity provider;
 * sign-in resolves on that binding alone, so an unbound row can hold the flag but never use it.
 * Revoking an administrator who cannot sign in never reduces the count that matters, so it is
 * always allowed. Before the first grant there are no administrators at all, which is allowed:
 * the rule protects a state once it exists, it does not create one.
 *
 * Every change writes one row to the audit table through {@see AccessAudit}, inside the same
 * transaction as the change, so a failed audit write rolls the change back. The row names the
 * target, the acting account (none from the console), how the change was made, and the flag
 * before and after. The change is also written to the application log, with row ids only (no
 * address, no subject). A no-op (granting an administrator, revoking a player) writes neither.
 *
 * Callers that only need to know whether a change would be accepted — a management surface
 * that marks the flag as not editable, say — use {@see canRevoke()}. Callers that make the
 * change use {@see grant()} / {@see revoke()}, which re-check under row locks and throw
 * {@see AdministratorChangeRefused} rather than trusting an earlier answer.
 */
final class ApplicationAdministrators
{
    public function __construct(
        private readonly OAuthClient $oauth,
        private readonly AccessAudit $audit,
    ) {}

    /**
     * Administrators, oldest account first.
     *
     * @return Collection<int, User>
     */
    public function all(): Collection
    {
        return User::query()->where('is_admin', true)->orderBy('id')->get();
    }

    /** Whether the account is bound to the configured provider, which is all sign-in resolves on. */
    public function canSignIn(User $user): bool
    {
        $provider = $this->provider();

        return $provider !== null && $this->boundTo($user, $provider);
    }

    /**
     * Whether revoking this account's administrator status would be accepted right now.
     *
     * Advisory: it reads without locks. {@see revoke()} decides again under locks.
     */
    public function canRevoke(User $user): bool
    {
        if (! $user->isAdministrator()) {
            return true;
        }

        $provider = $this->provider();
        if ($provider === null) {
            return false;
        }

        return ! $this->wouldStrandApplication($user, $this->all(), $provider);
    }

    /**
     * Make the account an administrator. Idempotent: returns false when it already was one.
     *
     * @throws AdministratorChangeRefused when the account cannot sign in
     */
    public function grant(User $user, AdministratorChangeOrigin $origin): bool
    {
        $provider = $this->provider() ?? throw AdministratorChangeRefused::providerUnknown();

        $changed = DB::transaction(function () use ($user, $provider, $origin): bool {
            $target = User::query()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();

            if ($target->isAdministrator()) {
                return false;
            }

            // An administrator nobody can sign in as is a grant that does nothing, and it
            // would make the list of administrators claim more than the app really has.
            if (! $this->boundTo($target, $provider)) {
                throw AdministratorChangeRefused::cannotSignIn($target);
            }

            $target->forceFill(['is_admin' => true])->save();

            $this->audit->record($origin->event(true), $target, $origin->actingUser, $origin->authMethod, [
                ...$origin->metadata,
                'change' => 'administrator_granted',
                'before' => ['application_admin' => false],
                'after' => ['application_admin' => true],
            ]);

            Log::notice('Application administrator granted.', [
                'user' => 'users#'.$target->getKey(),
                'actor' => $origin->label,
            ]);

            return true;
        });

        $user->refresh();

        return $changed;
    }

    /**
     * Remove the account's administrator status. Idempotent: returns false when it was not one.
     *
     * @throws AdministratorChangeRefused when it is the last administrator who can sign in
     */
    public function revoke(User $user, AdministratorChangeOrigin $origin): bool
    {
        $provider = $this->provider() ?? throw AdministratorChangeRefused::providerUnknown();

        $changed = DB::transaction(function () use ($user, $provider, $origin): bool {
            $administrators = $this->lockAdministrators();

            $target = $administrators->firstWhere('id', $user->getKey());
            if ($target === null) {
                return false;
            }

            if ($this->wouldStrandApplication($target, $administrators, $provider)) {
                throw AdministratorChangeRefused::lastAdministrator($target);
            }

            $target->forceFill(['is_admin' => false])->save();

            $this->audit->record($origin->event(false), $target, $origin->actingUser, $origin->authMethod, [
                ...$origin->metadata,
                'change' => 'administrator_revoked',
                'before' => ['application_admin' => true],
                'after' => ['application_admin' => false],
                'administrators_remaining' => $administrators->count() - 1,
            ]);

            Log::notice('Application administrator revoked.', [
                'user' => 'users#'.$target->getKey(),
                'actor' => $origin->label,
                'administrators_remaining' => $administrators->count() - 1,
            ]);

            return true;
        });

        $user->refresh();

        return $changed;
    }

    /**
     * Lock every administrator row, in a stable order. Call it inside a transaction, first.
     *
     * {@see revoke()} decides on these rows. Two concurrent revocations of the last two
     * administrators then queue on the same rows, and the second one counts after the first
     * has committed instead of before. A caller that must decide something else on the same
     * rows before changing the flag (the delegated access adapter compares a revision and
     * re-checks its actor) takes this lock first, so its decision and the rule's are made on
     * one locked state; revoke() re-taking it in the same transaction is a no-op. Lock
     * administrators before any other user row, so every path takes them in the same order.
     *
     * @return Collection<int, User>
     */
    public function lockAdministrators(): Collection
    {
        return User::query()
            ->where('is_admin', true)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
    }

    /**
     * @param  Collection<int, User>  $administrators
     */
    private function wouldStrandApplication(User $target, Collection $administrators, string $provider): bool
    {
        if (! $this->boundTo($target, $provider)) {
            return false;
        }

        return $administrators
            ->filter(fn (User $administrator): bool => $administrator->getKey() !== $target->getKey()
                && $this->boundTo($administrator, $provider))
            ->isEmpty();
    }

    private function boundTo(User $user, string $provider): bool
    {
        return $user->oauth_provider === $provider
            && is_string($user->oauth_subject)
            && $user->oauth_subject !== '';
    }

    private function provider(): ?string
    {
        try {
            return $this->oauth->providerName();
        } catch (HttpExceptionInterface) {
            return null;
        }
    }
}
