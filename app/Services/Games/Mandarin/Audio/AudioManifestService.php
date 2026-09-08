<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\Mandarin\MandarinAudioSource;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Course\CourseValidator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use JsonException;
use Throwable;

/**
 * Moves the *database half* of a generated audio cache between environments.
 *
 * Uploading the objects to a shared bucket is not enough: `resolve` only
 * returns a cache hit when a `mandarin_audio_assets` row records the recipe
 * hash, disk, key and content hash, and a `mandarin_audio_sources` row maps
 * the course source to that hash. This service exports those rows as a plain
 * JSON manifest and imports them again elsewhere, so a production deployment
 * can serve a fully generated course with no speech provider configured.
 *
 * The manifest is deliberately inert: recipes, content-addressed keys and
 * counts only — no credentials, no URLs, no absolute paths, no bytes. The
 * objects themselves travel by whatever copies buckets (rclone, aws s3 sync).
 *
 * @phpstan-type ManifestAsset array{recipe_hash: string, provider: string, kind: string, recipe: array<string, mixed>, text_length: int, disk: string, object_key: string, content_hash: string, content_type: string, bytes: int, duration_ms: int|null, provider_metadata: array<string, mixed>|null, ready_at: string|null}
 * @phpstan-type ManifestSource array{course_id: string, content_version: string, source_kind: string, source_id: string, variant: string, recipe_hash: string}
 * @phpstan-type ManifestCourse array{courseId: string, contentVersion: string}
 * @phpstan-type Manifest array{schemaVersion: int, exportedAt: string, courses: list<ManifestCourse>, counts: array{assets: int, sources: int}, assetsHash: string, assets: list<ManifestAsset>, sources: list<ManifestSource>}
 * @phpstan-type ImportResult array{inserted: int, refreshed: int, unchanged: int, conflicts: int, missing: int, sourcesWritten: int, sourcesSkipped: int, examples: array{inserted: list<string>, refreshed: list<string>, unchanged: list<string>}, problems: list<array{recipeHash: string, reason: string}>}
 */
class AudioManifestService
{
    public const SCHEMA_VERSION = 1;

    /** How many recipe hashes a dry run names per outcome; the counts carry the rest. */
    private const EXAMPLES = 5;

    public function __construct(private readonly CourseRepository $courses) {}

    // ── export ───────────────────────────────────────────────────────────────

    /**
     * Every ready asset (optionally only those on one disk) that a course
     * source mapping points at, plus those mappings. An asset no mapping
     * references can never be a cache hit on the importing side, so it is
     * left out unless `$includeUnreferenced` asks for the whole cache.
     *
     * @return Manifest
     */
    public function export(?string $disk = null, bool $includeUnreferenced = false): array
    {
        /** @var array<string, true> $referenced */
        $referenced = [];
        if (! $includeUnreferenced) {
            foreach (MandarinAudioSource::query()->distinct()->pluck('recipe_hash') as $hash) {
                $referenced[(string) $hash] = true;
            }
        }

        $query = MandarinAudioAsset::query()
            ->where('state', MandarinAudioAsset::STATE_READY)
            ->whereNotNull('disk')
            ->whereNotNull('object_key')
            ->whereNotNull('content_hash')
            ->orderBy('recipe_hash');
        if ($disk !== null && $disk !== '') {
            $query->where('disk', $disk);
        }

        /** @var list<ManifestAsset> $assets */
        $assets = [];
        /** @var array<string, true> $wanted */
        $wanted = [];
        foreach ($query->get() as $asset) {
            $hash = (string) $asset->recipe_hash;
            if (! $includeUnreferenced && ! isset($referenced[$hash])) {
                continue;
            }
            $wanted[$hash] = true;
            $assets[] = [
                'recipe_hash' => $hash,
                'provider' => (string) $asset->provider,
                'kind' => (string) $asset->kind,
                'recipe' => $asset->recipeArray(),
                'text_length' => (int) $asset->text_length,
                'disk' => (string) $asset->disk,
                'object_key' => (string) $asset->object_key,
                'content_hash' => (string) $asset->content_hash,
                'content_type' => (string) $asset->content_type,
                'bytes' => (int) $asset->bytes,
                'duration_ms' => $asset->duration_ms === null ? null : (int) $asset->duration_ms,
                'provider_metadata' => $this->decodeMetadata($asset->provider_metadata),
                'ready_at' => $asset->ready_at?->toIso8601String(),
            ];
        }

        /** @var list<ManifestSource> $sources */
        $sources = [];
        /** @var array<string, ManifestCourse> $courses */
        $courses = [];
        $rows = MandarinAudioSource::query()
            ->orderBy('course_id')->orderBy('content_version')->orderBy('source_kind')->orderBy('source_id')->orderBy('variant')
            ->get();
        foreach ($rows as $source) {
            if (! isset($wanted[(string) $source->recipe_hash])) {
                continue;
            }
            $sources[] = [
                'course_id' => (string) $source->course_id,
                'content_version' => (string) $source->content_version,
                'source_kind' => (string) $source->source_kind,
                'source_id' => (string) $source->source_id,
                'variant' => (string) $source->variant,
                'recipe_hash' => (string) $source->recipe_hash,
            ];
            $courses[$source->course_id.'@'.$source->content_version] = [
                'courseId' => (string) $source->course_id,
                'contentVersion' => (string) $source->content_version,
            ];
        }
        ksort($courses, SORT_STRING);

        return [
            'schemaVersion' => self::SCHEMA_VERSION,
            'exportedAt' => Carbon::now()->toIso8601String(),
            'courses' => array_values($courses),
            'counts' => ['assets' => count($assets), 'sources' => count($sources)],
            'assetsHash' => self::assetsHash($assets),
            'assets' => $assets,
            'sources' => $sources,
        ];
    }

    /** Canonical digest of the asset list, so an edited or truncated manifest is refused. */
    public static function assetsHash(mixed $assets): string
    {
        return hash('sha256', CourseValidator::canonicalJson($assets));
    }

    // ── parsing ──────────────────────────────────────────────────────────────

    /**
     * @return Manifest
     *
     * @throws InvalidArgumentException
     */
    public function parseFile(string $path): array
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new InvalidArgumentException('Manifest file does not exist or is not readable.');
        }
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new InvalidArgumentException('Manifest file could not be read.');
        }
        try {
            /** @var mixed $decoded */
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new InvalidArgumentException('Manifest is not valid JSON: '.$exception->getMessage());
        }
        if (! is_array($decoded)) {
            throw new InvalidArgumentException('Manifest must be a JSON object.');
        }

        return $this->parse($decoded);
    }

    /**
     * @param  array<mixed>  $decoded
     * @return Manifest
     *
     * @throws InvalidArgumentException
     */
    public function parse(array $decoded): array
    {
        $schema = $decoded['schemaVersion'] ?? null;
        if ($schema !== self::SCHEMA_VERSION) {
            throw new InvalidArgumentException('Unsupported manifest schemaVersion '.json_encode($schema).'; this build reads version '.self::SCHEMA_VERSION.'.');
        }
        $rawAssets = $decoded['assets'] ?? null;
        $rawSources = $decoded['sources'] ?? null;
        if (! is_array($rawAssets) || ! array_is_list($rawAssets) || ! is_array($rawSources) || ! array_is_list($rawSources)) {
            throw new InvalidArgumentException('Manifest must carry "assets" and "sources" arrays.');
        }
        $declaredHash = $decoded['assetsHash'] ?? null;
        if (! is_string($declaredHash) || $declaredHash !== self::assetsHash($rawAssets)) {
            throw new InvalidArgumentException('Manifest assetsHash does not match its asset list; the file is truncated or edited.');
        }

        /** @var list<ManifestAsset> $assets */
        $assets = [];
        /** @var array<string, true> $seen */
        $seen = [];
        foreach ($rawAssets as $index => $entry) {
            if (! is_array($entry)) {
                throw new InvalidArgumentException("Asset #{$index} is not an object.");
            }
            $asset = $this->parseAsset($entry, (int) $index);
            if (isset($seen[$asset['recipe_hash']])) {
                throw new InvalidArgumentException("Asset #{$index} repeats recipe hash ".substr($asset['recipe_hash'], 0, 12).'.');
            }
            $seen[$asset['recipe_hash']] = true;
            $assets[] = $asset;
        }

        /** @var list<ManifestSource> $sources */
        $sources = [];
        foreach ($rawSources as $index => $entry) {
            if (! is_array($entry)) {
                throw new InvalidArgumentException("Source #{$index} is not an object.");
            }
            $sources[] = $this->parseSource($entry, (int) $index);
        }

        /** @var list<ManifestCourse> $courses */
        $courses = [];
        $rawCourses = $decoded['courses'] ?? [];
        if (! is_array($rawCourses) || ! array_is_list($rawCourses)) {
            throw new InvalidArgumentException('Manifest "courses" must be an array.');
        }
        foreach ($rawCourses as $index => $entry) {
            if (! is_array($entry)) {
                throw new InvalidArgumentException("Course #{$index} is not an object.");
            }
            $courses[] = [
                'courseId' => $this->stringField($entry, 'courseId', "course #{$index}"),
                'contentVersion' => $this->stringField($entry, 'contentVersion', "course #{$index}"),
            ];
        }

        $exportedAt = $decoded['exportedAt'] ?? null;

        return [
            'schemaVersion' => self::SCHEMA_VERSION,
            'exportedAt' => is_string($exportedAt) ? $exportedAt : '',
            'courses' => $courses,
            'counts' => ['assets' => count($assets), 'sources' => count($sources)],
            'assetsHash' => $declaredHash,
            'assets' => $assets,
            'sources' => $sources,
        ];
    }

    // ── preflight ────────────────────────────────────────────────────────────

    /**
     * Disks the manifest names that this environment does not configure.
     *
     * @param  Manifest  $manifest
     * @return list<string>
     */
    public function unknownDisks(array $manifest): array
    {
        /** @var array<string, bool> $configured */
        $configured = (array) config('filesystems.disks', []);
        $unknown = [];
        foreach ($manifest['assets'] as $asset) {
            if (! array_key_exists($asset['disk'], $configured) && ! in_array($asset['disk'], $unknown, true)) {
                $unknown[] = $asset['disk'];
            }
        }
        sort($unknown, SORT_STRING);

        return $unknown;
    }

    /**
     * Course revisions the manifest references that were never imported here.
     * Importing rows for an unknown revision would create sources no resolve
     * can ever match, so it is refused rather than half-applied.
     *
     * @param  Manifest  $manifest
     * @return list<string>
     */
    public function missingRevisions(array $manifest): array
    {
        /** @var array<string, array{0: string, 1: string}> $identities */
        $identities = [];
        foreach ($manifest['courses'] as $course) {
            $identities[$course['courseId'].'@'.$course['contentVersion']] = [$course['courseId'], $course['contentVersion']];
        }
        foreach ($manifest['sources'] as $source) {
            $identities[$source['course_id'].'@'.$source['content_version']] = [$source['course_id'], $source['content_version']];
        }
        ksort($identities, SORT_STRING);

        $missing = [];
        foreach ($identities as $label => [$courseId, $contentVersion]) {
            if ($this->courses->revision($courseId, $contentVersion) === null) {
                $missing[] = $label;
            }
        }

        return $missing;
    }

    /**
     * Source mappings that do not name an allowlisted source in their imported revision.
     *
     * @param  Manifest  $manifest
     * @return list<string>
     */
    public function invalidSources(array $manifest): array
    {
        $courses = [];
        $invalid = [];
        foreach ($manifest['sources'] as $source) {
            $identity = $source['course_id'].'@'.$source['content_version'];
            if (! array_key_exists($identity, $courses)) {
                $courses[$identity] = $this->courses->revision($source['course_id'], $source['content_version']);
            }
            $course = $courses[$identity];
            if ($course !== null && ! $course->hasSource($source['source_kind'], $source['source_id'], $source['variant'])) {
                $invalid[] = $identity.':'.$source['source_kind'].':'.$source['source_id'].':'.$source['variant'];
            }
        }
        sort($invalid, SORT_STRING);

        return array_values(array_unique($invalid));
    }

    /**
     * Ensure a deployment manifest names the exact course being staged and
     * carries every core utterance, target and cue that live play can request.
     * Support glossary audio remains opt-in because most support entries are
     * intentionally shown for context without scheduled playback.
     *
     * @param  Manifest  $manifest
     * @return list<string>
     */
    public function courseCoverageProblems(array $manifest, string $courseId, string $contentVersion): array
    {
        $identity = $courseId.'@'.$contentVersion;
        $declared = false;
        foreach ($manifest['courses'] as $course) {
            if ($identity === $course['courseId'].'@'.$course['contentVersion']) {
                $declared = true;
                break;
            }
        }

        $course = $this->courses->revision($courseId, $contentVersion);
        if ($course === null) {
            return ["course revision {$identity} is not imported"];
        }

        /** @var array<string, ManifestAsset> $assets */
        $assets = array_column($manifest['assets'], null, 'recipe_hash');
        /** @var array<string, string> $mapped */
        $mapped = [];
        $problems = $declared ? [] : ['course declaration is missing'];
        foreach ($manifest['sources'] as $source) {
            if ($source['course_id'] === $courseId && $source['content_version'] === $contentVersion) {
                $key = $source['source_kind'].':'.$source['source_id'].':'.$source['variant'];
                $mapped[$key] = $source['recipe_hash'];
                $asset = $assets[$source['recipe_hash']] ?? null;
                if ($asset === null || ! $this->sourceMatchesRecipe($course, $source, $asset)) {
                    $problems[] = "source recipe mismatch: {$key}";
                }
            }
        }

        foreach ($course->utterances as $id => $utterance) {
            foreach ($utterance['audioVariants'] as $variant) {
                $key = "utterance:{$id}:{$variant}";
                if (! isset($mapped[$key])) {
                    $problems[] = $key;
                }
            }
        }
        foreach (array_keys($course->targets) as $id) {
            foreach (['normal', 'slow'] as $variant) {
                $key = "target:{$id}:{$variant}";
                if (! isset($mapped[$key])) {
                    $problems[] = $key;
                }
            }
        }
        foreach (array_keys($course->sfx) as $id) {
            $key = "sfx:{$id}:default";
            if (! isset($mapped[$key])) {
                $problems[] = $key;
            }
        }
        /** @var list<array{source_kind: string, source_id: string, variant: string}> $requiredSources */
        $requiredSources = config('mandarin.audio.required_sources', []);
        foreach ($requiredSources as $required) {
            $key = $required['source_kind'].':'.$required['source_id'].':'.$required['variant'];
            if (! $course->hasSource($required['source_kind'], $required['source_id'], $required['variant'])) {
                $problems[] = "configured source is invalid: {$key}";
            } elseif (! isset($mapped[$key])) {
                $problems[] = $key;
            }
        }

        sort($problems, SORT_STRING);

        return $problems;
    }

    /**
     * @param  ManifestSource  $source
     * @param  ManifestAsset  $asset
     */
    private function sourceMatchesRecipe(CourseIndex $course, array $source, array $asset): bool
    {
        $recipe = $asset['recipe'];
        if ($source['source_kind'] === 'sfx') {
            return $asset['kind'] === 'sfx'
                && ($recipe['kind'] ?? null) === 'sfx'
                && ($recipe['recipe'] ?? null) === $course->sfxRecipe($source['source_id']);
        }

        $text = $course->speechText($source['source_kind'], $source['source_id']);

        return $text !== null
            && $asset['kind'] === 'speech'
            && ($recipe['kind'] ?? null) === 'speech'
            && AudioRecipe::normalizeText((string) ($recipe['text'] ?? '')) === AudioRecipe::normalizeText($text)
            && ($recipe['variant'] ?? null) === $source['variant'];
    }

    // ── import ───────────────────────────────────────────────────────────────

    /**
     * Upsert the manifest's rows by recipe hash. A ready row whose content
     * hash differs is never downgraded — it is reported as a conflict and
     * left alone — so importing a stale manifest cannot un-publish audio a
     * newer generation produced. Re-running an executed import writes nothing.
     *
     * @param  Manifest  $manifest
     * @return ImportResult
     */
    public function import(array $manifest, bool $execute, bool $verifyObjects): array
    {
        $inserted = 0;
        $refreshed = 0;
        $unchanged = 0;
        $conflicts = 0;
        $missing = 0;
        /** @var array{inserted: list<string>, refreshed: list<string>, unchanged: list<string>} $examples */
        $examples = ['inserted' => [], 'refreshed' => [], 'unchanged' => []];
        /** @var list<array{recipeHash: string, reason: string}> $problems */
        $problems = [];
        /** @var array<string, true> $present recipe hashes a source may safely point at */
        $present = [];

        $existingAssets = $this->existingAssets($manifest);
        foreach ($manifest['assets'] as $asset) {
            $hash = $asset['recipe_hash'];
            $existing = $existingAssets[$hash] ?? null;

            if ($verifyObjects) {
                $problem = $this->objectProblem($asset);
                if ($problem !== null) {
                    $missing++;
                    $problems[] = ['recipeHash' => $hash, 'reason' => $problem];

                    continue;
                }
            }

            if ($existing !== null) {
                $present[$hash] = true;
            }

            if ($existing !== null && $existing->isReady()) {
                if ((string) $existing->content_hash === $asset['content_hash']) {
                    $sameLocation = $existing->disk === $asset['disk']
                        && $existing->object_key === $asset['object_key']
                        && $existing->content_type === $asset['content_type']
                        && (int) $existing->bytes === $asset['bytes'];
                    if ($sameLocation || ! $verifyObjects) {
                        $unchanged++;
                        $this->remember($examples['unchanged'], $hash);

                        continue;
                    }

                    $refreshed++;
                    $this->remember($examples['refreshed'], $hash);
                    if ($execute) {
                        $outcome = $this->refreshReady($existing, $asset);
                        if ($outcome !== null) {
                            $refreshed--;
                            $conflicts++;
                            array_pop($examples['refreshed']);
                            $problems[] = ['recipeHash' => $hash, 'reason' => $outcome];
                        }
                    }

                    continue;
                }
                $conflicts++;
                $problems[] = ['recipeHash' => $hash, 'reason' => 'already ready here with a different content hash; left untouched'];

                continue;
            }

            if ($existing === null) {
                $inserted++;
                $this->remember($examples['inserted'], $hash);
                if ($execute) {
                    $outcome = $this->insert($asset);
                    if ($outcome !== null) {
                        $inserted--;
                        $conflicts++;
                        array_pop($examples['inserted']);
                        $problems[] = ['recipeHash' => $hash, 'reason' => $outcome];

                        continue;
                    }
                }
                $present[$hash] = true;

                continue;
            }

            $refreshed++;
            $this->remember($examples['refreshed'], $hash);
            if ($execute) {
                $outcome = $this->refresh($existing, $asset);
                if ($outcome !== null) {
                    $refreshed--;
                    $conflicts++;
                    array_pop($examples['refreshed']);
                    $problems[] = ['recipeHash' => $hash, 'reason' => $outcome];
                }
            }
        }

        [$sourcesWritten, $sourcesSkipped] = $this->importSources($manifest, $present, $execute);

        return [
            'inserted' => $inserted,
            'refreshed' => $refreshed,
            'unchanged' => $unchanged,
            'conflicts' => $conflicts,
            'missing' => $missing,
            'sourcesWritten' => $sourcesWritten,
            'sourcesSkipped' => $sourcesSkipped,
            'examples' => $examples,
            'problems' => $problems,
        ];
    }

    // ── internals ────────────────────────────────────────────────────────────

    /**
     * @param  Manifest  $manifest
     * @return array<string, MandarinAudioAsset>
     */
    private function existingAssets(array $manifest): array
    {
        $hashes = array_column($manifest['assets'], 'recipe_hash');
        /** @var array<string, MandarinAudioAsset> $existing */
        $existing = [];
        // Chunked so a large manifest cannot exceed the driver's bound-parameter limit.
        foreach (array_chunk($hashes, 400) as $chunk) {
            foreach (MandarinAudioAsset::query()->whereIn('recipe_hash', $chunk)->get() as $asset) {
                $existing[(string) $asset->recipe_hash] = $asset;
            }
        }

        return $existing;
    }

    /**
     * @param  Manifest  $manifest
     * @param  array<string, true>  $present
     * @return array{0: int, 1: int}
     */
    private function importSources(array $manifest, array $present, bool $execute): array
    {
        $written = 0;
        $skipped = 0;
        /** @var array<string, string> $current */
        $current = [];
        foreach (MandarinAudioSource::query()->get() as $source) {
            $current[$this->sourceKey($source->course_id, $source->content_version, $source->source_kind, $source->source_id, $source->variant)] = (string) $source->recipe_hash;
        }

        foreach ($manifest['sources'] as $source) {
            if (! isset($present[$source['recipe_hash']])) {
                // Its asset was skipped, so the mapping would point at nothing.
                $skipped++;

                continue;
            }
            $key = $this->sourceKey($source['course_id'], $source['content_version'], $source['source_kind'], $source['source_id'], $source['variant']);
            if (($current[$key] ?? null) === $source['recipe_hash']) {
                continue;
            }
            $written++;
            if ($execute) {
                MandarinAudioSource::query()->updateOrCreate([
                    'course_id' => $source['course_id'],
                    'content_version' => $source['content_version'],
                    'source_kind' => $source['source_kind'],
                    'source_id' => $source['source_id'],
                    'variant' => $source['variant'],
                ], ['recipe_hash' => $source['recipe_hash']]);
            }
        }

        return [$written, $skipped];
    }

    private function sourceKey(string $courseId, string $contentVersion, string $kind, string $id, string $variant): string
    {
        return implode("\0", [$courseId, $contentVersion, $kind, $id, $variant]);
    }

    /**
     * @param  ManifestAsset  $asset
     * @return string|null the reason the row was not inserted
     */
    private function insert(array $asset): ?string
    {
        try {
            MandarinAudioAsset::query()->create($this->readyAttributes($asset) + [
                'recipe_hash' => $asset['recipe_hash'],
                'provider' => $asset['provider'],
                'kind' => $asset['kind'],
                'recipe' => json_encode($asset['recipe'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'text_length' => $asset['text_length'],
                'attempts' => 0,
            ]);

            return null;
        } catch (QueryException) {
            // Another process claimed the same recipe hash between the read and the write.
            return 'a row for this recipe appeared during the import; left as it is';
        } catch (Throwable $exception) {
            return 'could not be inserted ('.class_basename($exception).')';
        }
    }

    /**
     * @param  ManifestAsset  $asset
     * @return string|null the reason the row was not refreshed
     */
    private function refresh(MandarinAudioAsset $existing, array $asset): ?string
    {
        // Conditional: a row that became ready under us keeps whatever it generated.
        $updated = MandarinAudioAsset::query()
            ->whereKey($existing->id)
            ->where('state', '!=', MandarinAudioAsset::STATE_READY)
            ->update($this->readyAttributes($asset) + ['updated_at' => Carbon::now()]);

        return $updated === 1 ? null : 'became ready during the import; left as it is';
    }

    /**
     * @param  ManifestAsset  $asset
     * @return string|null the reason the ready row was not repointed
     */
    private function refreshReady(MandarinAudioAsset $existing, array $asset): ?string
    {
        $updated = MandarinAudioAsset::query()
            ->whereKey($existing->id)
            ->where('state', MandarinAudioAsset::STATE_READY)
            ->where('content_hash', $asset['content_hash'])
            ->where('disk', $existing->disk)
            ->where('object_key', $existing->object_key)
            ->update($this->readyAttributes($asset) + ['updated_at' => Carbon::now()]);

        return $updated === 1 ? null : 'changed during the import; left as it is';
    }

    /**
     * @param  ManifestAsset  $asset
     * @return array<string, mixed>
     */
    private function readyAttributes(array $asset): array
    {
        return [
            'state' => MandarinAudioAsset::STATE_READY,
            'disk' => $asset['disk'],
            'object_key' => $asset['object_key'],
            'content_hash' => $asset['content_hash'],
            'content_type' => $asset['content_type'],
            'bytes' => $asset['bytes'],
            'duration_ms' => $asset['duration_ms'],
            'provider_metadata' => $asset['provider_metadata'] === null ? null : json_encode($asset['provider_metadata'], JSON_UNESCAPED_UNICODE),
            'ready_at' => $asset['ready_at'] === null ? Carbon::now() : Carbon::parse($asset['ready_at']),
            'error_code' => null,
            'error_message' => null,
            'lease_token' => null,
            'lease_expires_at' => null,
        ];
    }

    /**
     * `--verify-objects`: the row is only published when the object is really
     * on the disk the manifest names, at the size it recorded.
     *
     * @param  ManifestAsset  $asset
     * @return string|null the problem, or null when the object checks out
     */
    private function objectProblem(array $asset): ?string
    {
        try {
            $filesystem = Storage::disk($asset['disk']);
            if (! $filesystem->exists($asset['object_key'])) {
                return "object is missing on {$asset['disk']}";
            }
            $size = $filesystem->size($asset['object_key']);
            if ($size !== $asset['bytes']) {
                return "object on {$asset['disk']} is {$size} bytes, manifest says {$asset['bytes']}";
            }

            return null;
        } catch (Throwable $exception) {
            // Never echo the message: a storage exception can carry a signed URL.
            return 'could not be checked on '.$asset['disk'].' ('.class_basename($exception).')';
        }
    }

    /** @param list<string> $bucket */
    private function remember(array &$bucket, string $hash): void
    {
        if (count($bucket) < self::EXAMPLES) {
            $bucket[] = substr($hash, 0, 12);
        }
    }

    /** @return array<string, mixed>|null */
    private function decodeMetadata(?string $json): ?array
    {
        if ($json === null || $json === '') {
            return null;
        }
        /** @var mixed $decoded */
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param  array<mixed>  $entry
     * @return ManifestAsset
     */
    private function parseAsset(array $entry, int $index): array
    {
        $label = "asset #{$index}";
        $recipe = $entry['recipe'] ?? null;
        if (! is_array($recipe)) {
            throw new InvalidArgumentException("The {$label} has no recipe object.");
        }
        $metadata = $entry['provider_metadata'] ?? null;
        if ($metadata !== null && ! is_array($metadata)) {
            throw new InvalidArgumentException("The {$label} has a non-object provider_metadata.");
        }
        $readyAt = $entry['ready_at'] ?? null;
        if ($readyAt !== null && ! is_string($readyAt)) {
            throw new InvalidArgumentException("The {$label} has a non-string ready_at.");
        }
        if (is_string($readyAt)) {
            try {
                Carbon::parse($readyAt);
            } catch (Throwable) {
                throw new InvalidArgumentException("The {$label} has an unparsable ready_at.");
            }
        }

        return [
            'recipe_hash' => $this->hashField($entry, 'recipe_hash', $label),
            'provider' => $this->stringField($entry, 'provider', $label),
            'kind' => $this->stringField($entry, 'kind', $label),
            'recipe' => $recipe,
            'text_length' => $this->intField($entry, 'text_length', $label),
            'disk' => $this->stringField($entry, 'disk', $label),
            'object_key' => $this->keyField($entry, $label),
            'content_hash' => $this->hashField($entry, 'content_hash', $label),
            'content_type' => $this->stringField($entry, 'content_type', $label),
            'bytes' => $this->intField($entry, 'bytes', $label),
            'duration_ms' => isset($entry['duration_ms']) ? $this->intField($entry, 'duration_ms', $label) : null,
            'provider_metadata' => $metadata,
            'ready_at' => $readyAt,
        ];
    }

    /**
     * @param  array<mixed>  $entry
     * @return ManifestSource
     */
    private function parseSource(array $entry, int $index): array
    {
        $label = "source #{$index}";

        return [
            'course_id' => $this->stringField($entry, 'course_id', $label),
            'content_version' => $this->stringField($entry, 'content_version', $label),
            'source_kind' => $this->stringField($entry, 'source_kind', $label),
            'source_id' => $this->stringField($entry, 'source_id', $label),
            'variant' => $this->stringField($entry, 'variant', $label),
            'recipe_hash' => $this->hashField($entry, 'recipe_hash', $label),
        ];
    }

    /** @param array<mixed> $entry */
    private function stringField(array $entry, string $field, string $label): string
    {
        $value = $entry[$field] ?? null;
        if (! is_string($value) || $value === '') {
            throw new InvalidArgumentException("The {$label} has no {$field}.");
        }

        return $value;
    }

    /** @param array<mixed> $entry */
    private function intField(array $entry, string $field, string $label): int
    {
        $value = $entry[$field] ?? null;
        if (! is_int($value) || $value < 0) {
            throw new InvalidArgumentException("The {$label} has a non-numeric {$field}.");
        }

        return $value;
    }

    /** @param array<mixed> $entry */
    private function hashField(array $entry, string $field, string $label): string
    {
        $value = $this->stringField($entry, $field, $label);
        if (preg_match('/^[0-9a-f]{64}$/', $value) !== 1) {
            throw new InvalidArgumentException("The {$label} has a malformed {$field}.");
        }

        return $value;
    }

    /**
     * Object keys are relative, content-addressed paths. An absolute path, a
     * URL or a traversal in a manifest is an attempt to read or publish
     * something outside the media prefix.
     *
     * @param  array<mixed>  $entry
     */
    private function keyField(array $entry, string $label): string
    {
        $value = $this->stringField($entry, 'object_key', $label);
        if (str_starts_with($value, '/') || str_contains($value, '..') || str_contains($value, '://')) {
            throw new InvalidArgumentException("The {$label} has an object_key that is not a relative storage key.");
        }

        return $value;
    }
}
