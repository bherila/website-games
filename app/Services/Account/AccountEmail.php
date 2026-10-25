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

    public static function heldByAnotherAccount(User $user, string $email): bool
    {
        return User::query()
            ->whereRaw('lower(email) = ?', [self::normalise($email)])
            ->whereKeyNot($user->getKey())
            ->exists();
    }

    /**
     * Emails a confirmation link for `$email` (the current address, to verify it, or a new
     * one). Replaces any earlier pending request, so only the latest link works.
     */
    public function request(User $user, string $email): void
    {
        $email = self::normalise($email);
        $token = Str::random(64);

        EmailChangeRequest::query()->updateOrCreate(['user_id' => $user->getKey()], [
            'email' => $email,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addMinutes(self::LINK_MINUTES),
        ]);

        Notification::route('mail', $email)->notify(new ConfirmEmailAddress(
            route('account.email.confirm', ['token' => $token]),
            changing: $email !== self::normalise($user->email),
        ));
    }

    /**
     * Completes the pending request whose link carried `$token`, for the signed-in `$user` only.
     *
     * @throws EmailConfirmationFailed
     */
    public function confirm(User $user, string $token): void
    {
        $previous = null;
        $expired = false;

        DB::transaction(function () use ($user, $token, &$previous, &$expired): void {
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
            if (self::heldByAnotherAccount($user, $request->email)) {
                throw EmailConfirmationFailed::taken();
            }

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
        });

        if ($expired) {
            throw EmailConfirmationFailed::expired();
        }
        if ($previous !== null) {
            Notification::route('mail', $previous)->notify(new EmailAddressChanged);
        }
    }
}
