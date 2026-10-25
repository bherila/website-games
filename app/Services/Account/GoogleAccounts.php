<?php

namespace App\Services\Account;

use App\Models\User;
use App\Models\UserIdentity;
use App\Services\Admin\AccessAudit;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Resolves a Google sign-in to an account. A Google subject already linked opens its account.
 * Otherwise the address is the key, but only when both sides vouch for it: Google says it is
 * verified, and this application has confirmed the same address on the account
 * (`email_verified_at`, set only by AccountEmail). An address held by an unconfirmed account
 * is refused rather than taken over; a new address creates a Google-only account.
 */
final class GoogleAccounts
{
    public function __construct(private readonly AccessAudit $audit) {}

    /**
     * @throws GoogleSignInRefused
     */
    public function resolve(string $subject, ?string $email, bool $emailVerified, ?string $name): User
    {
        $linked = $this->linkedUser($subject);
        if ($linked !== null) {
            return $linked;
        }
        if ($email === null || ! $emailVerified) {
            throw GoogleSignInRefused::unverifiedEmail();
        }

        $email = AccountEmail::normalise($email);

        try {
            return DB::transaction(function () use ($subject, $email, $name): User {
                $holder = User::query()->whereRaw('lower(email) = ?', [$email])->lockForUpdate()->first();
                if ($holder !== null && $holder->email_verified_at === null) {
                    throw GoogleSignInRefused::unconfirmedAccount();
                }

                $created = $holder === null;
                $user = $holder ?? User::query()->forceCreate([
                    'name' => $name !== null && trim($name) !== '' ? $name : Str::before($email, '@'),
                    'email' => $email,
                    // Google vouched for it, which is the same proof AccountEmail asks for.
                    'email_verified_at' => now(),
                    'password' => Hash::make(Str::random(64)),
                ]);
                if ($user->identities()->where('provider', UserIdentity::GOOGLE)->exists()) {
                    // One Google account per games account; a second one with the same address is not linked.
                    throw GoogleSignInRefused::alreadyLinked();
                }

                $user->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => $subject, 'email' => $email]);
                $this->audit->record(AccessAudit::SIGN_IN_LINKED, $user, $user, AccessAudit::METHOD_GOOGLE, ['created_account' => $created]);

                return $user;
            });
        } catch (QueryException $exception) {
            // A concurrent sign-in for the same Google account won the insert; use its link.
            if (in_array($exception->errorInfo[0] ?? null, ['23000', '23505'], true) && ($linked = $this->linkedUser($subject)) !== null) {
                return $linked;
            }

            throw $exception;
        }
    }

    private function linkedUser(string $subject): ?User
    {
        return UserIdentity::query()
            ->where('provider', UserIdentity::GOOGLE)
            ->where('subject', $subject)
            ->first()?->user;
    }
}
