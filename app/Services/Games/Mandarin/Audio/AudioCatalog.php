<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\Mandarin\MandarinAudioSource;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;

/**
 * Every audio source a course revision defines, each with the state of the asset that serves it,
 * for the operator dashboard.
 *
 * Read only and cheap: the state comes from the asset rows (one query for the whole revision),
 * never from a storage call, and nothing is claimed, enqueued, demoted or re-pointed. Identity is
 * the same recipe hash the resolver uses ({@see AudioAssetService::recipeFor()}), so a row this
 * reports as missing is exactly one a resolve would claim.
 *
 * States: `ready`, `queued`, `generating`, `failed` (the asset row's own states), `missing` (no
 * asset under the current recipe yet) and `unavailable` (no recipe can be made: no provider bound
 * and no recorded mapping, or text past the synthesis bound).
 *
 * @phpstan-type CatalogSource array{sourceKind: string, sourceId: string, variant: string}
 * @phpstan-type CatalogEntry array{key: string, source: CatalogSource, text: string, pinyin: string, en: string, role: string, state: string, code: string|null, assetId: int|null, provider: string|null, voice: string|null, attempts: int|null, error: string|null, updatedAt: string|null}
 */
class AudioCatalog
{
    public const STATES = ['ready', 'queued', 'generating', 'failed', 'missing', 'unavailable'];

    public function __construct(private readonly AudioAssetService $assets) {}

    /**
     * Entries for every source of the revision, or for just the given ones.
     *
     * @param  list<CatalogSource>|null  $sources
     * @return list<CatalogEntry>
     */
    public function entries(CourseIndex $course, ?array $sources = null): array
    {
        $rows = [];
        foreach ($sources ?? $this->sources($course) as $source) {
            $hash = null;
            $code = null;
            try {
                $hash = $this->assets->recipeFor($course, $source)->hash;
            } catch (SpeechProviderException $exception) {
                $code = $exception->errorCode;
            }
            $rows[] = ['source' => $source, 'hash' => $hash, 'code' => $code];
        }

        // Without a provider no recipe can be computed; a recorded mapping (an imported manifest,
        // an earlier generation) still names the asset that serves the source.
        $mapped = $this->mappedHashes($course);
        foreach ($rows as $i => $row) {
            if ($row['hash'] === null && $row['code'] === 'provider_unconfigured') {
                $rows[$i]['hash'] = $mapped[self::key($row['source'])] ?? null;
            }
        }

        $hashes = array_values(array_unique(array_filter(array_column($rows, 'hash'))));
        $assets = [];
        foreach (array_chunk($hashes, 500) as $chunk) {
            foreach (MandarinAudioAsset::query()->whereIn('recipe_hash', $chunk)->get() as $asset) {
                $assets[$asset->recipe_hash] = $asset;
            }
        }

        $entries = [];
        foreach ($rows as $row) {
            $asset = $row['hash'] === null ? null : ($assets[$row['hash']] ?? null);
            $entries[] = $this->entry($course, $row['source'], $asset, $row['hash'] === null ? $row['code'] : null);
        }

        return $entries;
    }

    /**
     * Counts per state, every state present.
     *
     * @param  list<CatalogEntry>  $entries
     * @return array<string, int>
     */
    public function summary(array $entries): array
    {
        $counts = array_fill_keys(self::STATES, 0);
        foreach ($entries as $entry) {
            $counts[$entry['state']]++;
        }

        return $counts;
    }

    /**
     * Speech sources (utterances, targets, supporting glossary, each in every variant the
     * revision allows), then the UI cues.
     *
     * @return list<CatalogSource>
     */
    public function sources(CourseIndex $course): array
    {
        $sources = [];
        foreach (['utterance' => $course->utterances, 'target' => $course->targets, 'support' => $course->supports] as $kind => $items) {
            foreach (array_keys($items) as $id) {
                foreach (['normal', 'slow'] as $variant) {
                    if ($course->hasSource($kind, (string) $id, $variant)) {
                        $sources[] = ['sourceKind' => $kind, 'sourceId' => (string) $id, 'variant' => $variant];
                    }
                }
            }
        }
        foreach (array_keys($course->sfx) as $id) {
            $sources[] = ['sourceKind' => 'sfx', 'sourceId' => (string) $id, 'variant' => 'default'];
        }

        return $sources;
    }

    /**
     * The source a dashboard key names, when the revision defines it.
     *
     * @return CatalogSource|null
     */
    public function source(CourseIndex $course, string $key): ?array
    {
        $parts = explode(':', $key);
        if (count($parts) !== 3) {
            return null;
        }
        [$kind, $id, $variant] = $parts;

        return $course->hasSource($kind, $id, $variant) ? ['sourceKind' => $kind, 'sourceId' => $id, 'variant' => $variant] : null;
    }

    /** @param CatalogSource $source */
    public static function key(array $source): string
    {
        return $source['sourceKind'].':'.$source['sourceId'].':'.$source['variant'];
    }

    /**
     * @param  CatalogSource  $source
     * @return CatalogEntry
     */
    private function entry(CourseIndex $course, array $source, ?MandarinAudioAsset $asset, ?string $code): array
    {
        $state = match (true) {
            $asset === null => $code === null ? 'missing' : 'unavailable',
            $asset->state === MandarinAudioAsset::STATE_READY => $asset->isReady() ? 'ready' : 'missing',
            in_array($asset->state, [MandarinAudioAsset::STATE_QUEUED, MandarinAudioAsset::STATE_GENERATING, MandarinAudioAsset::STATE_FAILED], true) => $asset->state,
            default => 'missing',
        };
        $recipe = $asset === null ? [] : $asset->recipeArray();
        $item = match ($source['sourceKind']) {
            'utterance' => $course->utterances[$source['sourceId']] ?? [],
            'target' => $course->targets[$source['sourceId']] ?? [],
            'support' => $course->supports[$source['sourceId']] ?? [],
            default => [],
        };
        $roleId = $course->roleFor($source['sourceKind'], $source['sourceId']);

        return [
            'key' => self::key($source),
            'source' => $source,
            'text' => $source['sourceKind'] === 'sfx' ? (string) ($course->sfxRecipe($source['sourceId']) ?? $source['sourceId']) : (string) ($item['zh'] ?? ''),
            'pinyin' => (string) ($item['pinyin'] ?? ''),
            'en' => (string) ($item['en'] ?? ''),
            'role' => $source['sourceKind'] === 'sfx' ? 'UI cue' : (string) ($course->roles[$roleId]['name'] ?? ucfirst($roleId)),
            'state' => $state,
            'code' => $state === 'failed' ? $asset->error_code : $code,
            'assetId' => $asset?->id,
            'provider' => $asset?->provider,
            'voice' => isset($recipe['voice']) ? (string) $recipe['voice'] : null,
            'attempts' => $asset?->attempts,
            'error' => $state === 'failed' ? $asset->error_message : null,
            'updatedAt' => $asset?->updated_at?->toIso8601String(),
        ];
    }

    /** @return array<string, string> recipe hash by source key */
    private function mappedHashes(CourseIndex $course): array
    {
        $hashes = [];
        $rows = MandarinAudioSource::query()
            ->where('course_id', $course->courseId())
            ->where('content_version', $course->contentVersion())
            ->get(['source_kind', 'source_id', 'variant', 'recipe_hash']);
        foreach ($rows as $row) {
            $hashes[$row->source_kind.':'.$row->source_id.':'.$row->variant] = (string) $row->recipe_hash;
        }

        return $hashes;
    }
}
