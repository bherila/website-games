<?php

namespace App\Services\Games;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\User;
use App\Models\UserGameData;
use Illuminate\Support\Facades\DB;

class GameDataStore
{
    public function __construct(private readonly GameDataMerger $merger) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{status: 'saved'|'stale'|'superseded', row: UserGameData|null}
     */
    public function upsert(
        User $user,
        GameSlug $game,
        GameDataScope $scope,
        string $slot,
        array $data,
        ?int $expectedRevision,
        ?string $writerId = null,
        ?int $writerSequence = null,
    ): array {
        return DB::transaction(function () use ($user, $game, $scope, $slot, $data, $expectedRevision, $writerId, $writerSequence): array {
            return $this->upsertLocked(
                $user,
                $game,
                $scope,
                $slot,
                $data,
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
        }, attempts: 3);
    }

    /** @return array{status: 'deleted'|'missing'|'stale'|'superseded', row: UserGameData|null} */
    public function delete(
        User $user,
        GameSlug $game,
        GameDataScope $scope,
        string $slot,
        ?int $expectedRevision,
        ?string $writerId = null,
        ?int $writerSequence = null,
    ): array {
        return DB::transaction(function () use ($user, $game, $scope, $slot, $expectedRevision, $writerId, $writerSequence): array {
            return $this->deleteLocked(
                $user,
                $game,
                $scope,
                $slot,
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
        }, attempts: 3);
    }

    /**
     * @param  list<array{action: 'put'|'delete', scope: GameDataScope, slot: string, data: array<string, mixed>, revision: int|null, writer_id?: string|null, writer_sequence?: int|null}>  $operations
     * @return list<array{action: 'put'|'delete', scope: GameDataScope, slot: string, status: 'saved'|'stale'|'superseded'|'deleted'|'missing', row: UserGameData|null}>
     */
    public function batch(User $user, GameSlug $game, array $operations): array
    {
        return DB::transaction(function () use ($user, $game, $operations): array {
            $results = [];
            $blockedSaveStatus = null;
            foreach ($operations as $operation) {
                if ($operation['scope'] !== GameDataScope::Save) {
                    continue;
                }

                $disposition = $this->saveOperationDisposition(
                    $this->lockRow($user, $game, $operation['scope'], $operation['slot']),
                    $operation['action'],
                    $operation['data'],
                    $operation['revision'],
                    $operation['writer_id'] ?? null,
                    $operation['writer_sequence'] ?? null,
                );
                if ($disposition === 'stale' || $disposition === 'superseded') {
                    $blockedSaveStatus = $disposition;

                    break;
                }
            }

            foreach ($operations as $operation) {
                $writerId = $operation['writer_id'] ?? null;
                $writerSequence = $operation['writer_sequence'] ?? null;
                if ($blockedSaveStatus !== null && $operation['scope'] === GameDataScope::Profile && $operation['slot'] === 'inventory') {
                    $results[] = [
                        'action' => $operation['action'],
                        'scope' => $operation['scope'],
                        'slot' => $operation['slot'],
                        'status' => $blockedSaveStatus,
                        'row' => $this->lockRow($user, $game, $operation['scope'], $operation['slot']),
                    ];

                    continue;
                }

                if ($operation['action'] === 'put') {
                    $result = $this->upsertLocked(
                        $user,
                        $game,
                        $operation['scope'],
                        $operation['slot'],
                        $operation['data'],
                        $operation['revision'],
                        $writerId,
                        $writerSequence,
                    );
                    $results[] = [
                        'action' => 'put',
                        'scope' => $operation['scope'],
                        'slot' => $operation['slot'],
                        'status' => $result['status'],
                        'row' => $result['row'],
                    ];

                    continue;
                }

                $result = $this->deleteLocked(
                    $user,
                    $game,
                    $operation['scope'],
                    $operation['slot'],
                    $operation['revision'],
                    $writerId,
                    $writerSequence,
                );
                $results[] = [
                    'action' => 'delete',
                    'scope' => $operation['scope'],
                    'slot' => $operation['slot'],
                    'status' => $result['status'],
                    'row' => $result['row'],
                ];
            }

            return $results;
        }, attempts: 3);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{status: 'saved'|'stale'|'superseded', row: UserGameData|null}
     */
    private function upsertLocked(
        User $user,
        GameSlug $game,
        GameDataScope $scope,
        string $slot,
        array $data,
        ?int $expectedRevision,
        ?string $writerId,
        ?int $writerSequence,
    ): array {
        if ($scope === GameDataScope::Save) {
            return $this->upsertSaveLocked(
                $user,
                $game,
                $slot,
                $data,
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
        }

        $locked = $this->lockRow($user, $game, $scope, $slot);
        if (! $locked) {
            $now = now();
            UserGameData::query()->insertOrIgnore([
                'user_id' => $user->id,
                'game' => $game->value,
                'scope' => $scope->value,
                'slot' => $slot,
                'data' => '{}',
                'revision' => 0,
                'is_deleted' => false,
                'writer_id' => null,
                'writer_sequence' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $locked = $this->lockRow($user, $game, $scope, $slot);
        }

        if (! $locked) {
            return ['status' => 'stale', 'row' => null];
        }

        $locked->data = $this->merger->merge($locked->data, $data);
        $locked->revision++;
        $locked->is_deleted = false;
        $locked->writer_id = null;
        $locked->writer_sequence = null;
        $locked->save();

        return ['status' => 'saved', 'row' => $locked->refresh()];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{status: 'saved'|'stale'|'superseded', row: UserGameData|null}
     */
    private function upsertSaveLocked(
        User $user,
        GameSlug $game,
        string $slot,
        array $data,
        ?int $expectedRevision,
        ?string $writerId,
        ?int $writerSequence,
    ): array {
        $locked = $this->lockRow($user, $game, GameDataScope::Save, $slot);
        $disposition = $this->saveOperationDisposition(
            $locked,
            'put',
            $data,
            $expectedRevision,
            $writerId,
            $writerSequence,
        );
        if ($disposition === 'stale' || $disposition === 'superseded') {
            return ['status' => $disposition, 'row' => $locked];
        }
        if ($disposition === 'idempotent') {
            return ['status' => 'saved', 'row' => $locked];
        }

        if (! $locked) {
            $inserted = $this->insertSaveRow(
                $user,
                $game,
                $slot,
                $data,
                false,
                $writerId,
                $writerSequence,
            );
            $locked = $this->lockRow($user, $game, GameDataScope::Save, $slot);
            if ($inserted === 1) {
                return ['status' => 'saved', 'row' => $locked];
            }

            $disposition = $this->saveOperationDisposition(
                $locked,
                'put',
                $data,
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
            if ($disposition === 'stale' || $disposition === 'superseded') {
                return ['status' => $disposition, 'row' => $locked];
            }
            if ($disposition === 'idempotent') {
                return ['status' => 'saved', 'row' => $locked];
            }
        }

        if (! $locked) {
            return ['status' => 'stale', 'row' => null];
        }

        $locked->data = $data;
        $locked->revision++;
        $locked->is_deleted = false;
        $this->assignWriter($locked, $writerId, $writerSequence);
        $locked->save();

        return ['status' => 'saved', 'row' => $locked->refresh()];
    }

    /** @return array{status: 'deleted'|'missing'|'stale'|'superseded', row: UserGameData|null} */
    private function deleteLocked(
        User $user,
        GameSlug $game,
        GameDataScope $scope,
        string $slot,
        ?int $expectedRevision,
        ?string $writerId,
        ?int $writerSequence,
    ): array {
        if ($scope === GameDataScope::Save) {
            return $this->deleteSaveLocked(
                $user,
                $game,
                $slot,
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
        }

        $row = $this->lockRow($user, $game, $scope, $slot);
        if (! $row) {
            return ['status' => $expectedRevision === null ? 'missing' : 'stale', 'row' => null];
        }

        $row->delete();

        return ['status' => 'deleted', 'row' => null];
    }

    /** @return array{status: 'deleted'|'missing'|'stale'|'superseded', row: UserGameData|null} */
    private function deleteSaveLocked(
        User $user,
        GameSlug $game,
        string $slot,
        ?int $expectedRevision,
        ?string $writerId,
        ?int $writerSequence,
    ): array {
        $locked = $this->lockRow($user, $game, GameDataScope::Save, $slot);
        $disposition = $this->saveOperationDisposition(
            $locked,
            'delete',
            [],
            $expectedRevision,
            $writerId,
            $writerSequence,
        );
        if ($disposition === 'stale' || $disposition === 'superseded') {
            return ['status' => $disposition, 'row' => $locked];
        }
        if ($disposition === 'idempotent') {
            return ['status' => 'deleted', 'row' => $locked];
        }
        if ($disposition === 'missing') {
            return ['status' => 'missing', 'row' => $locked];
        }

        if (! $locked) {
            $inserted = $this->insertSaveRow(
                $user,
                $game,
                $slot,
                [],
                true,
                $writerId,
                $writerSequence,
            );
            $locked = $this->lockRow($user, $game, GameDataScope::Save, $slot);
            if ($inserted === 1) {
                return ['status' => 'deleted', 'row' => $locked];
            }

            $disposition = $this->saveOperationDisposition(
                $locked,
                'delete',
                [],
                $expectedRevision,
                $writerId,
                $writerSequence,
            );
            if ($disposition === 'stale' || $disposition === 'superseded') {
                return ['status' => $disposition, 'row' => $locked];
            }
            if ($disposition === 'idempotent') {
                return ['status' => 'deleted', 'row' => $locked];
            }
            if ($disposition === 'missing') {
                return ['status' => 'missing', 'row' => $locked];
            }
        }

        if (! $locked) {
            return ['status' => 'stale', 'row' => null];
        }

        $locked->data = [];
        $locked->revision++;
        $locked->is_deleted = true;
        $this->assignWriter($locked, $writerId, $writerSequence);
        $locked->save();

        return ['status' => 'deleted', 'row' => $locked->refresh()];
    }

    /**
     * @param  'put'|'delete'  $action
     * @param  array<string, mixed>  $data
     * @return 'apply'|'idempotent'|'missing'|'stale'|'superseded'
     */
    private function saveOperationDisposition(
        ?UserGameData $row,
        string $action,
        array $data,
        ?int $expectedRevision,
        ?string $writerId,
        ?int $writerSequence,
    ): string {
        if (! $row) {
            if ($expectedRevision !== null) {
                return 'stale';
            }

            if ($action === 'delete' && ! $this->hasWriter($writerId, $writerSequence)) {
                return 'missing';
            }

            return 'apply';
        }

        if (
            $this->hasWriter($writerId, $writerSequence)
            && $row->writer_id === $writerId
            && $row->writer_sequence !== null
        ) {
            if ($writerSequence < $row->writer_sequence) {
                return 'superseded';
            }
            if ($writerSequence === $row->writer_sequence) {
                if ($action === 'delete' && $row->is_deleted) {
                    return 'idempotent';
                }
                if ($action === 'put' && ! $row->is_deleted && $this->dataMatches($row->data, $data)) {
                    return 'idempotent';
                }

                return 'stale';
            }

            return 'apply';
        }

        if ($action === 'put') {
            if ($expectedRevision === null) {
                return $row->is_deleted ? 'apply' : 'stale';
            }

            return $expectedRevision === $row->revision ? 'apply' : 'stale';
        }

        if ($expectedRevision === null) {
            if ($row->is_deleted && $this->hasWriter($writerId, $writerSequence)) {
                return 'apply';
            }

            return $row->is_deleted ? 'missing' : 'stale';
        }

        return $expectedRevision === $row->revision ? 'apply' : 'stale';
    }

    /** @param array<string, mixed> $data */
    private function insertSaveRow(
        User $user,
        GameSlug $game,
        string $slot,
        array $data,
        bool $isDeleted,
        ?string $writerId,
        ?int $writerSequence,
    ): int {
        $now = now();

        return UserGameData::query()->insertOrIgnore([
            'user_id' => $user->id,
            'game' => $game->value,
            'scope' => GameDataScope::Save->value,
            'slot' => $slot,
            'data' => json_encode($data, JSON_THROW_ON_ERROR),
            'revision' => 1,
            'is_deleted' => $isDeleted,
            'writer_id' => $this->hasWriter($writerId, $writerSequence) ? $writerId : null,
            'writer_sequence' => $this->hasWriter($writerId, $writerSequence) ? $writerSequence : null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function assignWriter(UserGameData $row, ?string $writerId, ?int $writerSequence): void
    {
        $row->writer_id = $this->hasWriter($writerId, $writerSequence) ? $writerId : null;
        $row->writer_sequence = $this->hasWriter($writerId, $writerSequence) ? $writerSequence : null;
    }

    private function hasWriter(?string $writerId, ?int $writerSequence): bool
    {
        return $writerId !== null && $writerSequence !== null;
    }

    /**
     * @param  array<string, mixed>  $existing
     * @param  array<string, mixed>  $incoming
     */
    private function dataMatches(array $existing, array $incoming): bool
    {
        return json_encode($this->canonicalizeData($existing), JSON_THROW_ON_ERROR)
            === json_encode($this->canonicalizeData($incoming), JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<mixed>  $data
     * @return array<mixed>
     */
    private function canonicalizeData(array $data): array
    {
        if (array_is_list($data)) {
            return array_map(
                fn (mixed $value): mixed => is_array($value) ? $this->canonicalizeData($value) : $value,
                $data,
            );
        }

        ksort($data);

        return array_map(
            fn (mixed $value): mixed => is_array($value) ? $this->canonicalizeData($value) : $value,
            $data,
        );
    }

    private function lockRow(
        User $user,
        GameSlug $game,
        GameDataScope $scope,
        string $slot,
    ): ?UserGameData {
        return UserGameData::query()
            ->where('user_id', $user->id)
            ->where('game', $game)
            ->where('scope', $scope)
            ->where('slot', $slot)
            ->lockForUpdate()
            ->first();
    }
}
