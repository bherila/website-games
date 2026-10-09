<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Admin\AdministratorChangeRefused;
use App\Services\Admin\ApplicationAdministrators;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Grant, revoke or list application administrators.
 *
 * This is how the first administrator comes to exist: accounts are created at first sign-in
 * and never start as administrators, and there is no web surface that grants the flag.
 *
 * The account is named by its exact local users id and nothing else. An address is not an
 * identifier here (the provider does not verify it and its owner can change it), so the
 * command never searches by one. Confirm out of band which row belongs to whom, then name it.
 *
 * Both changes are idempotent, so re-running one is harmless. The last-administrator rule and
 * the log entry live in {@see ApplicationAdministrators}, not here, so every caller keeps them.
 */
#[Signature('users:admin
    {action : grant, revoke or list}
    {user? : The local users table id (grant and revoke)}')]
#[Description('Grant, revoke or list application administrators.')]
class ManageAdministratorsCommand extends Command
{
    public function handle(ApplicationAdministrators $administrators): int
    {
        $action = (string) $this->argument('action');

        if ($action === 'list') {
            return $this->list($administrators);
        }

        if (! in_array($action, ['grant', 'revoke'], true)) {
            $this->components->error('The action must be grant, revoke or list.');

            return self::FAILURE;
        }

        $id = $this->argument('user');

        // Digits only: no email, no name, no partial match, and no loose string-to-integer
        // coercion turning "1abc" into users#1.
        if (! is_string($id) || preg_match('/\A[1-9][0-9]{0,18}\z/', $id) !== 1) {
            $this->components->error('Name the account by its exact numeric users id.');

            return self::FAILURE;
        }

        $user = User::query()->find($id);

        if ($user === null) {
            $this->components->error(sprintf('There is no users#%s.', $id));

            return self::FAILURE;
        }

        try {
            $changed = $action === 'grant'
                ? $administrators->grant($user, 'console')
                : $administrators->revoke($user, 'console');
        } catch (AdministratorChangeRefused $refused) {
            $this->components->error($refused->getMessage());

            return self::FAILURE;
        }

        $this->components->info(match (true) {
            $action === 'grant' && $changed => sprintf('users#%s is now an administrator.', $user->getKey()),
            $action === 'grant' => sprintf('users#%s is already an administrator.', $user->getKey()),
            $changed => sprintf('users#%s is no longer an administrator.', $user->getKey()),
            default => sprintf('users#%s is not an administrator.', $user->getKey()),
        });

        return self::SUCCESS;
    }

    private function list(ApplicationAdministrators $administrators): int
    {
        $rows = $administrators->all();

        if ($rows->isEmpty()) {
            $this->components->warn('There are no administrators. Grant one with: php artisan users:admin grant <users-id>');

            return self::SUCCESS;
        }

        $this->table(
            ['id', 'name', 'email', 'can sign in'],
            $rows->map(fn (User $user): array => [
                $user->getKey(),
                $user->name,
                $user->email,
                $administrators->canSignIn($user) ? 'yes' : 'no',
            ])->all(),
        );

        if ($rows->every(fn (User $user): bool => ! $administrators->canSignIn($user))) {
            $this->components->warn('No administrator can sign in.');
        }

        return self::SUCCESS;
    }
}
