<?php

namespace App\Services\Account;

use App\Enums\Games\GameDataScope;
use App\Models\TowerSaveSlot;
use App\Models\User;
use App\Models\UserGameData;
use App\Models\UserIdentity;
use App\Services\Admin\AccessAudit;
use App\Services\Games\GameDataMerger;
use Illuminate\Support\Facades\DB;

/**
 * Folds one account into another, as if the absorbed account had been a second device of the
 * kept one, then deletes the absorbed account.
 *
 * - Sign-in methods move across. An account holds one identity-provider binding and one Google
 *   link, so two of the same kind are refused rather than one being dropped.
 * - Game progress rows (profile/level) combine through GameDataMerger, the same rules that settle
 *   two devices: best values win for metrics, and otherwise the more recently updated row's
 *   fields win. In-level snapshots (save scope) keep the more recently updated one. A row only
 *   one account has moves as is; a deletion tombstone never erases the other account's live row.
 * - Tower save slots move; on a clash the autosave keeps the newer one, and a manual save moves
 *   to a free manual slot when there is one, otherwise the newer is kept.
 * - Mandarin practice events move, except ones both accounts already recorded, and are numbered
 *   after the kept account's last event.
 */
final class AccountMerge
{
    private const MANUAL_TOWER_SLOTS = ['slot-a', 'slot-b', 'slot-c'];

    public function __construct(
        private readonly GameDataMerger $merger,
        private readonly AccountDeletion $deletion,
        private readonly AccessAudit $audit,
    ) {}

    /**
     * @throws AccountMergeRefused
     */
    public function assertMergeable(User $keep, User $absorb): void
    {
        if ($keep->is($absorb)) {
            throw AccountMergeRefused::sameAccount();
        }
        if ($absorb->isAdministrator()) {
            throw AccountMergeRefused::administrator();
        }
        if ($keep->oauth_subject !== null && $absorb->oauth_subject !== null) {
            throw AccountMergeRefused::bothUseIdentityProvider();
        }
        $kinds = fn (User $user): array => $user->identities()->pluck('provider')->all();
        if (array_intersect($kinds($keep), $kinds($absorb)) !== []) {
            throw AccountMergeRefused::bothUseGoogle();
        }
    }

    /**
     * @return array{game_rows: int, tower_slots: int, practice_events: int}
     *
     * @throws AccountMergeRefused
     */
    public function merge(User $keep, User $absorb, string $authMethod, ?User $actingUser): array
    {
        return DB::transaction(function () use ($keep, $absorb, $authMethod, $actingUser): array {
            $keep = User::query()->lockForUpdate()->findOrFail($keep->getKey());
            $absorb = User::query()->lockForUpdate()->findOrFail($absorb->getKey());
            $this->assertMergeable($keep, $absorb);

            if ($absorb->oauth_subject !== null) {
                $binding = ['oauth_provider' => $absorb->oauth_provider, 'oauth_subject' => $absorb->oauth_subject];
                $absorb->forceFill(['oauth_provider' => null, 'oauth_subject' => null])->save();
                $keep->forceFill($binding)->save();
            }
            UserIdentity::query()->where('user_id', $absorb->getKey())->update(['user_id' => $keep->getKey()]);

            $summary = [
                'game_rows' => $this->mergeGameData($keep, $absorb),
                'tower_slots' => $this->mergeTowerSlots($keep, $absorb),
                'practice_events' => $this->mergePracticeEvents($keep, $absorb),
            ];

            $this->audit->record(AccessAudit::ACCOUNTS_MERGED, $keep, $actingUser, $authMethod, ['absorbed_user_id' => $absorb->getKey()] + $summary);
            $this->deletion->delete($absorb);

            return $summary;
        });
    }

    private function mergeGameData(User $keep, User $absorb): int
    {
        $rows = UserGameData::query()->where('user_id', $absorb->getKey())->lockForUpdate()->get();
        foreach ($rows as $row) {
            $kept = UserGameData::query()
                ->where('user_id', $keep->getKey())
                ->where('game', $row->game)
                ->where('scope', $row->scope)
                ->where('slot', $row->slot)
                ->lockForUpdate()
                ->first();
            if ($kept === null) {
                $row->forceFill(['user_id' => $keep->getKey()])->save();

                continue;
            }

            // A deletion tombstone never erases the other account's live row, and a live row
            // replaces a tombstone.
            if ($row->is_deleted) {
                $row->delete();

                continue;
            }
            if ($kept->is_deleted) {
                $kept->forceFill(['data' => $row->data, 'is_deleted' => false, 'revision' => $kept->revision + 1])->save();
                $row->delete();

                continue;
            }

            $absorbedIsNewer = $row->updated_at !== null && ($kept->updated_at === null || $row->updated_at->greaterThan($kept->updated_at));
            if ($row->scope === GameDataScope::Save) {
                $data = $absorbedIsNewer ? $row->data : $kept->data;
            } else {
                // Older first, newer as the incoming write, exactly as two devices settle.
                $data = $absorbedIsNewer ? $this->merger->merge($kept->data, $row->data) : $this->merger->merge($row->data, $kept->data);
            }
            // A new revision tells the kept account's devices to read the combined row.
            $kept->forceFill(['data' => $data, 'revision' => $kept->revision + 1])->save();
            $row->delete();
        }

        return $rows->count();
    }

    private function mergeTowerSlots(User $keep, User $absorb): int
    {
        $slots = TowerSaveSlot::query()->where('user_id', $absorb->getKey())->lockForUpdate()->get();
        foreach ($slots as $slot) {
            $taken = TowerSaveSlot::query()->where('user_id', $keep->getKey())->lockForUpdate()->pluck('updated_at', 'slot');
            $clear = ['user_id' => $keep->getKey(), 'lease_token' => null, 'lease_acquired_at' => null, 'lease_expires_at' => null];
            if (! $taken->has($slot->slot)) {
                $slot->forceFill($clear)->save();

                continue;
            }
            $free = array_values(array_diff(self::MANUAL_TOWER_SLOTS, $taken->keys()->all()));
            if (in_array($slot->slot, self::MANUAL_TOWER_SLOTS, true) && $free !== []) {
                $slot->forceFill($clear + ['slot' => $free[0]])->save();

                continue;
            }
            $keptUpdated = $taken->get($slot->slot);
            if ($slot->updated_at !== null && ($keptUpdated === null || $slot->updated_at->greaterThan($keptUpdated))) {
                TowerSaveSlot::query()->where('user_id', $keep->getKey())->where('slot', $slot->slot)->delete();
                $slot->forceFill($clear)->save();
            } else {
                $slot->delete();
            }
        }

        return $slots->count();
    }

    private function mergePracticeEvents(User $keep, User $absorb): int
    {
        $events = DB::table('mandarin_practice_events');
        $known = DB::table('mandarin_practice_events')->where('user_id', $keep->getKey())->select('client_event_id');
        $events->clone()->where('user_id', $absorb->getKey())->whereIn('client_event_id', $known)->delete();

        // Sequences are unique per account, so moved events continue after the kept account's
        // last one, in their original order.
        $next = (int) $events->clone()->where('user_id', $keep->getKey())->max('sequence');
        $moving = $events->clone()->where('user_id', $absorb->getKey())->orderBy('sequence')->pluck('id');
        foreach ($moving as $id) {
            DB::table('mandarin_practice_events')->where('id', $id)->update(['user_id' => $keep->getKey(), 'sequence' => ++$next]);
        }

        return $moving->count();
    }
}
