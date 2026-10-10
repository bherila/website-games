<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Admin\AccessAudit;
use App\Services\Games\Mandarin\Course\CourseIndex;
use Illuminate\Support\Facades\DB;

/**
 * The operator's paid audio actions, as the admin dashboard offers them. Each one is idempotent,
 * never queues a row that is already queued or generating, and goes through the resolver's own
 * paths: a missing source is claimed by {@see AudioAssetService::claimMissing()} (the insert
 * playback and `mandarin:audio:warm` use), an existing row is re-queued by
 * {@see AudioAssetService::requeue()}.
 *
 * An action that queues anything writes one `mandarin_audio_requested` row to the audit table,
 * in the same transaction (so jobs dispatch only after both commit). An action that queues
 * nothing writes no row.
 *
 * @phpstan-import-type CatalogEntry from AudioCatalog
 * @phpstan-import-type CatalogSource from AudioCatalog
 *
 * @phpstan-type OperationResult array{action: string, queued: int, skipped: list<array{key: string, reason: string}>}
 */
class AudioOperations
{
    public const ACTION_REQUEST = 'request';

    public const ACTION_REGENERATE = 'regenerate';

    public const ACTION_REQUEST_MISSING = 'request_missing';

    public const ACTION_RETRY_FAILED = 'retry_failed';

    /** Source keys kept in one audit row; the count is always exact. */
    public const AUDITED_KEYS = 50;

    public function __construct(
        private readonly AudioAssetService $assets,
        private readonly AudioCatalog $catalog,
        private readonly AccessAudit $audit,
    ) {}

    /**
     * Queue one missing or failed source. A ready, queued or generating source is left alone.
     *
     * @param  CatalogSource  $source
     * @return OperationResult
     */
    public function request(CourseIndex $course, array $source, User $actor): array
    {
        return $this->run(self::ACTION_REQUEST, $course, $actor, function () use ($course, $source): array {
            $entry = $this->entryFor($course, $source);

            return match ($entry['state']) {
                'missing' => $this->claim($course, [$entry]),
                'failed' => $this->requeue([$entry], AudioAssetService::REQUEUE_FROM_FAILED),
                default => [[], [['key' => $entry['key'], 'reason' => $entry['state']]]],
            };
        });
    }

    /**
     * Generate a ready source again. Costs money, so the caller has confirmed it.
     *
     * @param  CatalogSource  $source
     * @return OperationResult
     */
    public function regenerate(CourseIndex $course, array $source, User $actor): array
    {
        return $this->run(self::ACTION_REGENERATE, $course, $actor, function () use ($course, $source): array {
            $entry = $this->entryFor($course, $source);

            return $entry['state'] === 'ready'
                ? $this->requeue([$entry], AudioAssetService::REQUEUE_FROM_READY)
                : [[], [['key' => $entry['key'], 'reason' => $entry['state']]]];
        });
    }

    /**
     * Queue every source with no asset yet.
     *
     * @return OperationResult
     */
    public function requestMissing(CourseIndex $course, User $actor): array
    {
        return $this->run(self::ACTION_REQUEST_MISSING, $course, $actor, fn (): array => $this->claim(
            $course,
            array_values(array_filter($this->catalog->entries($course), static fn (array $entry): bool => $entry['state'] === 'missing')),
        ));
    }

    /**
     * Queue every failed source again, with its attempts starting over.
     *
     * @return OperationResult
     */
    public function retryFailed(CourseIndex $course, User $actor): array
    {
        return $this->run(self::ACTION_RETRY_FAILED, $course, $actor, fn (): array => $this->requeue(
            array_values(array_filter($this->catalog->entries($course), static fn (array $entry): bool => $entry['state'] === 'failed')),
            AudioAssetService::REQUEUE_FROM_FAILED,
        ));
    }

    /**
     * @param  callable(): array{0: list<CatalogEntry>, 1: list<array{key: string, reason: string}>}  $operation
     * @return OperationResult
     */
    private function run(string $action, CourseIndex $course, User $actor, callable $operation): array
    {
        return DB::transaction(function () use ($action, $course, $actor, $operation): array {
            [$queued, $skipped] = $operation();

            if ($queued !== []) {
                $keys = array_column($queued, 'key');
                $this->audit->record(AccessAudit::MANDARIN_AUDIO_REQUESTED, $actor, $actor, AccessAudit::METHOD_SESSION, [
                    'action' => $action,
                    'count' => count($queued),
                    'course_id' => $course->courseId(),
                    'content_version' => $course->contentVersion(),
                    'sources' => array_slice($keys, 0, self::AUDITED_KEYS),
                    'sources_truncated' => count($keys) > self::AUDITED_KEYS,
                ]);
            }

            return ['action' => $action, 'queued' => count($queued), 'skipped' => $skipped];
        });
    }

    /**
     * Claim missing sources. Only a source this call queued counts as queued (and is audited):
     * one another request queued first is skipped with its current state.
     *
     * @param  list<CatalogEntry>  $entries
     * @return array{0: list<CatalogEntry>, 1: list<array{key: string, reason: string}>}
     */
    private function claim(CourseIndex $course, array $entries): array
    {
        $queued = [];
        $skipped = [];
        foreach ($entries as $entry) {
            if ($this->assets->claimMissing($course, $entry['source'])) {
                $queued[] = $entry;

                continue;
            }
            $now = $this->catalog->entries($course, [$entry['source']])[0];
            $skipped[] = ['key' => $entry['key'], 'reason' => $now['state'] === 'missing' ? ($now['code'] ?? 'generation_disabled') : $now['state']];
        }

        return [$queued, $skipped];
    }

    /**
     * @param  list<CatalogEntry>  $entries
     * @return array{0: list<CatalogEntry>, 1: list<array{key: string, reason: string}>}
     */
    private function requeue(array $entries, string $fromState): array
    {
        $ids = array_values(array_filter(array_column($entries, 'assetId')));
        $assets = MandarinAudioAsset::query()->whereKey($ids)->get()->keyBy('id');
        $queued = [];
        $skipped = [];
        foreach ($entries as $entry) {
            $asset = $entry['assetId'] === null ? null : $assets->get($entry['assetId']);
            if ($asset !== null && $this->assets->requeue($asset, $fromState)) {
                $queued[] = $entry;
            } else {
                $skipped[] = ['key' => $entry['key'], 'reason' => $asset === null ? 'missing' : ($asset->state === $fromState ? 'generation_disabled' : $asset->state)];
            }
        }

        return [$queued, $skipped];
    }

    /**
     * @param  CatalogSource  $source
     * @return CatalogEntry
     */
    private function entryFor(CourseIndex $course, array $source): array
    {
        if (! $course->hasSource($source['sourceKind'], $source['sourceId'], $source['variant'])) {
            throw new \InvalidArgumentException(AudioCatalog::key($source).' is not a source of this revision.');
        }

        return $this->catalog->entries($course, [$source])[0];
    }
}
