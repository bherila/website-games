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
use Illuminate\Support\Str;

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
 * - Tower save slots move; a lease-only row (no payload) never beats a real save. On a clash the
 *   autosave keeps the newer one, and a manual save moves to a free manual slot when there is one,
 *   otherwise the newer is kept. A game open on a replaced slot is displaced as by a takeover.
 * - Mandarin practice events move, except ones both accounts already recorded, and the combined
 *   history is renumbered in the order it happened, as the review scheduler replays it.
 */
final class AccountMerge
{
    private const MANUAL_TOWER_SLOTS = ['slot-a', 'slot-b', 'slot-c'];

    /**
     * A writer's later sequence is accepted without a revision check (GameDataStore), so a
     * replaced row must forget its last writer.
     */
    private const NO_WRITER = ['writer_id' => null, 'writer_sequence' => null];

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
     * `$absorbHolds` is the address whose confirmation authorized a self-service merge: the
     * absorbed account must still hold it, confirmed, once locked.
     *
     * @return array{game_rows: int, tower_slots: int, practice_events: int}
     *
     * @throws AccountMergeRefused
     */
    public function merge(User $keep, User $absorb, string $authMethod, ?User $actingUser, ?string $absorbHolds = null): array
    {
        return DB::transaction(function () use ($keep, $absorb, $authMethod, $actingUser, $absorbHolds): array {
            $keep = User::query()->lockForUpdate()->findOrFail($keep->getKey());
            $absorb = User::query()->lockForUpdate()->findOrFail($absorb->getKey());
            if ($absorbHolds !== null && (AccountEmail::normalise($absorb->email) !== AccountEmail::normalise($absorbHolds) || $absorb->email_verified_at === null)) {
                throw AccountMergeRefused::addressMoved();
            }
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
                $kept->forceFill(['data' => $row->data, 'is_deleted' => false, 'revision' => $kept->revision + 1] + self::NO_WRITER)->save();
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
            // A new revision with no recorded writer makes every device of the kept account,
            // including one that last wrote this row, resolve the conflict and read the result.
            $kept->forceFill(['data' => $data, 'revision' => $kept->revision + 1] + self::NO_WRITER)->save();
            $row->delete();
        }

        return $rows->count();
    }

    private function mergeTowerSlots(User $keep, User $absorb): int
    {
        $slots = TowerSaveSlot::query()->where('user_id', $absorb->getKey())->lockForUpdate()->get();
        foreach ($slots as $slot) {
            // A row with no payload is only a lease (TowerSaveController::acquire); it holds no save.
            if (! $slot->hasPayload()) {
                $slot->delete();

                continue;
            }
            $keptRows = TowerSaveSlot::query()->where('user_id', $keep->getKey())->lockForUpdate()->get()->keyBy('slot');
            $place = function (string $target) use ($slot, $keep, $keptRows): void {
                $replaced = $keptRows->get($target);
                // A game open on the replaced slot is displaced as by another device's takeover:
                // a lease it does not hold, until its own would have expired, so its next write
                // is refused rather than overwriting the moved save.
                $lease = $replaced?->leaseActive()
                    ? ['lease_token' => Str::random(48), 'lease_acquired_at' => now(), 'lease_expires_at' => $replaced->lease_expires_at]
                    : ['lease_token' => null, 'lease_acquired_at' => null, 'lease_expires_at' => null];
                $replaced?->delete();
                $slot->forceFill(['user_id' => $keep->getKey(), 'slot' => $target] + $lease)->save();
            };
            $kept = $keptRows->get($slot->slot);
            if ($kept === null || ! $kept->hasPayload()) {
                $place($slot->slot);

                continue;
            }
            $free = collect(self::MANUAL_TOWER_SLOTS)->first(fn (string $manual): bool => ! $keptRows->has($manual) || ! $keptRows->get($manual)->hasPayload());
            if (in_array($slot->slot, self::MANUAL_TOWER_SLOTS, true) && $free !== null) {
                $place($free);
            } elseif ($slot->updated_at !== null && ($kept->updated_at === null || $slot->updated_at->greaterThan($kept->updated_at))) {
                $place($slot->slot);
            } else {
                $slot->delete();
            }
        }

        return $slots->count();
    }

    private function mergePracticeEvents(User $keep, User $absorb): int
    {
        $events = fn () => DB::table('mandarin_practice_events');

        // Events both accounts recorded stay once. The ids are read first: MySQL refuses a DELETE
        // whose subquery selects from the table being deleted from.
        $known = $events()->where('user_id', $keep->getKey())->pluck('client_event_id')->all();
        $duplicates = collect($known)->chunk(500)->flatMap(fn ($chunk) => $events()->where('user_id', $absorb->getKey())->whereIn('client_event_id', $chunk->all())->pluck('id'))->all();
        foreach (array_chunk($duplicates, 500) as $chunk) {
            $events()->whereIn('id', $chunk)->delete();
        }

        // Move the rest above every existing sequence, then renumber the combined history in the
        // order it happened: the scheduler replays reviews by sequence with their accepted times.
        // Ties keep the kept account's events first. Sequences are unique per account and
        // unsigned, so the renumbering first lifts every row above the final range.
        $ceiling = (int) $events()->whereIn('user_id', [$keep->getKey(), $absorb->getKey()])->max('sequence');
        $moving = $events()->where('user_id', $absorb->getKey())->orderBy('sequence')->pluck('id');
        foreach ($moving->values() as $index => $id) {
            $events()->where('id', $id)->update(['user_id' => $keep->getKey(), 'sequence' => $ceiling + 1 + $index]);
        }
        if ($moving->isNotEmpty()) {
            $ordered = $events()->where('user_id', $keep->getKey())->orderBy('accepted_at')->orderBy('sequence')->pluck('id');
            $lift = $ceiling + 1 + $moving->count();
            $events()->where('user_id', $keep->getKey())->increment('sequence', $lift);
            foreach ($ordered->values() as $index => $id) {
                $events()->where('id', $id)->update(['sequence' => $index + 1]);
            }
        }

        return $moving->count();
    }
}
