<?php

namespace App\Services\Account;

use App\Models\TowerSaveSlot;
use App\Models\User;
use App\Models\UserGameData;
use App\Services\Admin\AccessAudit;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Deletes an account and everything stored for it. Game saves, tower save slots, API tokens and
 * database sessions have no cascading foreign key, so they are removed here; sign-in links, email
 * requests, Mandarin practice history and the auth package's tables cascade from the user row.
 * The audit row recording the deletion is kept with its user nulled and the old id in metadata.
 * Administrators are refused: the flag is removed first, so the last-administrator rule in
 * ApplicationAdministrators stays the only way that changes.
 */
final class AccountDeletion
{
    public function __construct(private readonly AccessAudit $audit) {}

    public function delete(User $user): void
    {
        if ($user->isAdministrator()) {
            throw new LogicException('Administrators cannot delete their own account.');
        }

        DB::transaction(function () use ($user): void {
            $this->audit->record(AccessAudit::ACCOUNT_DELETED, $user, $user, AccessAudit::METHOD_SESSION, [
                'deleted_user_id' => $user->getKey(),
            ]);

            UserGameData::query()->where('user_id', $user->getKey())->delete();
            TowerSaveSlot::query()->where('user_id', $user->getKey())->delete();
            DB::table('personal_access_tokens')->where('tokenable_type', $user->getMorphClass())->where('tokenable_id', $user->getKey())->delete();
            DB::table(config('session.table', 'sessions'))->where('user_id', $user->getKey())->delete();
            $user->delete();
        });
    }
}
