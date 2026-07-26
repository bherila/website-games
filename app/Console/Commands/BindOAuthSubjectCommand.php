<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

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

        if ($provider === null) {
            $this->components->error('No provider name was given and none is configured.');

            return self::FAILURE;
        }

        $subject = trim((string) $this->argument('subject'));

        if ($subject === '' || strlen($subject) > 191) {
            $this->components->error('The subject must be a non-empty value of at most 191 characters.');

            return self::FAILURE;
        }

        $userId = (string) $this->argument('user');
        $user = User::query()->find($userId);

        if ($user === null) {
            $this->components->error(sprintf('There is no users#%s to link.', $userId));

            return self::FAILURE;
        }

        if ($user->oauth_subject !== null) {
            if ($user->oauth_provider === $provider && $user->oauth_subject === $subject) {
                $this->components->info(sprintf('users#%s is already linked to that subject.', $user->getKey()));

                return self::SUCCESS;
            }

            $this->components->error(sprintf(
                'users#%s is already linked to a different identity. Refusing to re-point it.',
                $user->getKey(),
            ));

            return self::FAILURE;
        }

        $claimant = User::query()
            ->where('oauth_provider', $provider)
            ->where('oauth_subject', $subject)
            ->first();

        if ($claimant !== null) {
            $this->components->error(sprintf(
                'That subject is already claimed by users#%s. Refusing to bind it twice.',
                $claimant->getKey(),
            ));

            return self::FAILURE;
        }

        DB::transaction(function () use ($user, $provider, $subject): void {
            $user->forceFill([
                'oauth_provider' => $provider,
                'oauth_subject' => $subject,
            ])->save();
        });

        $this->components->info(sprintf('Linked users#%s to the %s identity.', $user->getKey(), $provider));

        return self::SUCCESS;
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
}
