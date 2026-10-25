<?php

namespace App\Services\Account;

use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Notifications\ConfirmEmailAddress;
use App\Notifications\EmailAddressChanged;
use App\Services\Admin\AccessAudit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * The account's email is owned by this application once confirmed here: a confirmation link
 * sent to the address is the only way to set `email_verified_at`, and a confirmed address is no
 * longer replaced by whatever the sign-in provider reports. Confirming proves control of the
 * mailbox, which is what lets later sign-ins be matched to the account by that address.
 */
final class AccountEmail
{
    public const LINK_MINUTES = 60;

    public function __construct(private readonly AccessAudit $audit) {}

    /** Normalised form used for storage and comparison. */
    public static function normalise(string $email): string
    {
        return Str::lower(trim($email));
    }

    public static function holder(User $user, string $email): ?User
    {
        return User::query()
            ->whereRaw('lower(email) = ?', [self::normalise($email)])
            ->whereKeyNot($user->getKey())
            ->first();
    }

    /**
     * Emails a confirmation link for `$email` (the current address, to verify it, or a new
     * one). Replaces any earlier pending request, so only the latest link works.
     */
    public function request(User $user, string $email): void
    {
        $email = self::normalise($email);
        $token = Str::random(64);

        // A new row, never an update: anything bound to an earlier request (its link, or a merge
        // offer made from it) must not carry over to a different address.
        DB::transaction(function () use ($user, $email, $token): void {
            EmailChangeRequest::query()->where('user_id', $user->getKey())->delete();
            EmailChangeRequest::query()->create([
                'user_id' => $user->getKey(),
                'email' => $email,
                'token_hash' => hash('sha256', $token),
                'expires_at' => now()->addMinutes(self::LINK_MINUTES),
            ]);
        });

        Notification::route('mail', $email)->notify(new ConfirmEmailAddress(
            route('account.email.confirm', ['token' => $token]),
            changing: $email !== self::normalise($user->email),
        ));
    }

    /**
     * Completes the pending request whose link carried `$token`, for the signed-in `$user` only.
     *
     * Returns the pending request instead of completing it when the address belongs to another
     * account that confirmed it: opening the link proved control of that mailbox, which under
     * the email-as-key rule is control of that account, so the caller may offer a merge
     * ({@see completeWithMerge()}). An address held by an unconfirmed account is refused.
     *
     * @throws EmailConfirmationFailed
     */
    public function confirm(User $user, string $token): ?EmailChangeRequest
    {
        $previous = null;
        $expired = false;
        $mergeable = null;

        DB::transaction(function () use ($user, $token, &$previous, &$expired, &$mergeable): void {
            $request = EmailChangeRequest::query()
                ->where('token_hash', hash('sha256', $token))
                ->lockForUpdate()
                ->first();

            // Another account's link is treated exactly like a wrong one.
            if ($request === null || $request->user_id !== $user->getKey()) {
                throw EmailConfirmationFailed::invalid();
            }
            if ($request->expires_at->isPast()) {
                // Spent either way; deleted here and reported once the transaction commits.
                $request->delete();
                $expired = true;

                return;
            }
            $holder = self::holder($user, $request->email);
            if ($holder !== null) {
                if ($holder->email_verified_at === null) {
                    throw EmailConfirmationFailed::taken();
                }
                $mergeable = $request;

                return;
            }

            $previous = $this->apply($user, $request);
        });

        if ($expired) {
            throw EmailConfirmationFailed::expired();
        }
        $this->notifyPrevious($previous);

        return $mergeable;
    }

    /**
     * What a merge offer is bound to when its link is opened: that exact request (by its token
     * hash), that address, and the account that held it. Accepting checks all three again, so an
     * offer can never be turned toward an address whose link was not opened.
     *
     * @return array{request: int, token_hash: string, email: string, holder: int}
     */
    public static function mergeBinding(User $user, EmailChangeRequest $request): array
    {
        $holder = self::holder($user, $request->email);

        return [
            'request' => (int) $request->getKey(),
            'token_hash' => $request->token_hash,
            'email' => $request->email,
            'holder' => (int) $holder?->getKey(),
        ];
    }

    /**
     * The pending request a binding still describes, or null if anything changed since its link
     * was opened: a newer request, a different address, or a different holder.
     *
     * @param  array<mixed>  $binding
     */
    public static function boundRequest(User $user, array $binding, bool $lock = false): ?EmailChangeRequest
    {
        $query = EmailChangeRequest::query()
            ->whereKey($binding['request'] ?? 0)
            ->where('user_id', $user->getKey())
            ->where('token_hash', (string) ($binding['token_hash'] ?? ''))
            ->where('email', (string) ($binding['email'] ?? ''))
            ->where('expires_at', '>', now());
        $request = ($lock ? $query->lockForUpdate() : $query)->first();
        if ($request === null) {
            return null;
        }
        $holder = self::holder($user, $request->email);

        return $holder !== null && $holder->getKey() === ($binding['holder'] ?? null) ? $request : null;
    }

    /**
     * Merges the account holding the bound address into `$user`, then gives `$user` the
     * address. The binding must still describe this account's pending request, and the holder
     * must still hold the address, confirmed; otherwise nothing changes.
     *
     * @param  array<mixed>  $binding
     *
     * @throws EmailConfirmationFailed
     * @throws AccountMergeRefused
     */
    public function completeWithMerge(User $user, array $binding, AccountMerge $merge): void
    {
        $previous = null;

        DB::transaction(function () use ($user, $binding, $merge, &$previous): void {
            $request = self::boundRequest($user, $binding, lock: true);
            if ($request === null) {
                throw EmailConfirmationFailed::expired();
            }

            $holder = self::holder($user, $request->email);
            if ($holder === null || $holder->email_verified_at === null) {
                throw EmailConfirmationFailed::taken();
            }
            $merge->merge($user, $holder, AccessAudit::METHOD_SESSION, $user, absorbHolds: $request->email);

            $previous = $this->apply($user->refresh(), $request);
        });

        $this->notifyPrevious($previous);
    }

    /** Gives the account the requested address, confirmed. Returns the address it replaced, if any. */
    private function apply(User $user, EmailChangeRequest $request): ?string
    {
        $changing = $request->email !== self::normalise($user->email);
        $previous = $changing ? $user->email : null;
        $user->forceFill(['email' => $request->email, 'email_verified_at' => now()])->save();
        $request->delete();

        $this->audit->record(
            $changing ? AccessAudit::EMAIL_CHANGED : AccessAudit::EMAIL_VERIFIED,
            $user,
            $user,
            AccessAudit::METHOD_SESSION,
            [],
        );

        return $previous;
    }

    private function notifyPrevious(?string $previous): void
    {
        if ($previous !== null) {
            Notification::route('mail', $previous)->notify(new EmailAddressChanged);
        }
    }
}
