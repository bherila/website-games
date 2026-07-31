<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Link an account that predates the identity provider to its provider subject.
 *
 * This app's accounts were copied across from the provider's own database before OAuth
 * existed, which left them holding an address but no `oauth_subject`. Sign-in resolves
 * solely on the subject, so such a row can never be reached: the first login tries to
 * create a second account, collides with the unique index on the address, and is refused.
 *
 * The link cannot be inferred at sign-in time. Matching the asserted address against an
 * unbound local row is the account takeover the subject binding exists to prevent, and the
 * provider does not assert `email_verified`, so there is no claim strong enough to justify
 * trusting the address. It is a deliberate operator action, taken once per copied account
 * after confirming out of band that the two rows are the same person.
 *
 * The guards below make that action safe to run — and safe to re-run. It will not overwrite
 * a subject that is already bound, and it will not hand one subject to a second row, so the
 * worst outcome of a mistyped id is a refusal rather than a silent re-pointing of one
 * person's saved games at somebody else's account.
 */
#[Signature('oauth:bind-subject
    {user : The local users table id to link}
    {subject : The provider subject claim (the sub value) for that account}
    {--provider= : Provider name; defaults to the configured identity provider}')]
#[Description('Link an existing local account to its identity-provider subject.')]
class BindOAuthSubjectCommand extends Command
{
    public function handle(): int
    {
        $provider = $this->resolveProvider();

        if (
            $provider === null
            || $provider !== trim($provider)
            || Str::length($provider) > 64
            || strlen($provider) > 256
        ) {
            $this->components->error('The provider must have no surrounding whitespace and contain at most 64 characters.');

            return self::FAILURE;
        }

        // OIDC subjects are exact, case-sensitive strings. Do not trim: a
        // trailing space is part of the identifier and VARBINARY preserves it.
        $subject = (string) $this->argument('subject');

        if ($subject === '' || strlen($subject) > 191) {
            $this->components->error('The subject must be a non-empty value of at most 191 characters.');

            return self::FAILURE;
        }

        $userId = (string) $this->argument('user');

        try {
            $result = DB::transaction(function () use ($userId, $provider, $subject): array {
                // The decision and write belong under one row lock. Checking first and
                // opening the transaction afterwards lets a concurrent bind re-point
                // the account between those two operations.
                $user = User::query()->lockForUpdate()->find($userId);

                if ($user === null) {
                    return $this->result(
                        self::FAILURE,
                        'error',
                        sprintf('There is no users#%s to link.', $userId),
                    );
                }

                if ($user->oauth_subject !== null) {
                    if ($user->oauth_provider === $provider && $user->oauth_subject === $subject) {
                        return $this->result(
                            self::SUCCESS,
                            'info',
                            sprintf('users#%s is already linked to that subject.', $user->getKey()),
                        );
                    }

                    return $this->result(
                        self::FAILURE,
                        'error',
                        sprintf(
                            'users#%s is already linked to a different identity. Refusing to re-point it.',
                            $user->getKey(),
                        ),
                    );
                }

                $claimant = User::query()
                    ->where('oauth_provider', $provider)
                    ->where('oauth_subject', $subject)
                    ->lockForUpdate()
                    ->first();

                if ($claimant !== null) {
                    return $this->result(
                        self::FAILURE,
                        'error',
                        sprintf(
                            'That subject is already claimed by users#%s. Refusing to bind it twice.',
                            $claimant->getKey(),
                        ),
                    );
                }

                $user->forceFill([
                    'oauth_provider' => $provider,
                    'oauth_subject' => $subject,
                ])->save();

                return $this->result(
                    self::SUCCESS,
                    'info',
                    sprintf('Linked users#%s to the %s identity.', $user->getKey(), $provider),
                );
            });
        } catch (QueryException $exception) {
            // A second target can still race for the same previously-unclaimed
            // subject on databases without a locking gap read. The unique index is
            // the final guard; turn that expected refusal into operator-facing output.
            if (! in_array($exception->errorInfo[0] ?? null, ['23000', '23505'], true)) {
                throw $exception;
            }

            $claimant = User::query()
                ->where('oauth_provider', $provider)
                ->where('oauth_subject', $subject)
                ->first();
            $result = $this->result(
                self::FAILURE,
                'error',
                $claimant === null
                    ? 'The identity changed while it was being linked. Nothing was re-pointed; retry after checking the account.'
                    : sprintf(
                        'That subject is already claimed by users#%s. Refusing to bind it twice.',
                        $claimant->getKey(),
                    ),
            );
        }

        $result['kind'] === 'info'
            ? $this->components->info($result['message'])
            : $this->components->error($result['message']);

        return $result['exit'];
    }

    private function resolveProvider(): ?string
    {
        $option = $this->option('provider');

        if (is_string($option) && $option !== '') {
            return $option;
        }

        $configured = config('services.identity_provider.name');

        return is_string($configured) && $configured !== '' ? $configured : null;
    }

    /**
     * @return array{exit: int, kind: 'error'|'info', message: string}
     */
    private function result(int $exit, string $kind, string $message): array
    {
        return [
            'exit' => $exit,
            'kind' => $kind,
            'message' => $message,
        ];
    }
}
