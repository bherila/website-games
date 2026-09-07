<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Jobs\Mandarin\GenerateMandarinAudioJob;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\Mandarin\MandarinAudioSource;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Sfx\SfxRenderer;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;
use App\Services\Games\Mandarin\Speech\SpeechProviderFactory;
use App\Services\Games\Mandarin\Speech\SpeechRequest;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * Recipe identity, database state, deduplication, lease and storage for
 * generated audio. Read paths (resolve for a ready object, poll) never enqueue
 * anything unless the caller is allowed to generate.
 */
class AudioAssetService
{
    public function __construct(
        private readonly SpeechSynthesizer $speech,
        private readonly SfxRenderer $sfx,
        private readonly AudioValidator $validator,
        private readonly AudioDeliveryService $delivery,
        private readonly GenerationBudget $budget,
        private readonly SpeechProviderFactory $providers,
    ) {}

    /**
     * Resolve up to 16 allowlisted sources. `$allowGenerate` is false for
     * guests and read-only callers; they still get cache hits.
     *
     * @param  list<array{sourceKind: string, sourceId: string, variant: string}>  $sources
     * @return list<array<string, mixed>>
     */
    public function resolve(CourseIndex $course, array $sources, bool $allowGenerate, string $guestReason = 'sign_in_required'): array
    {
        $results = [];
        foreach ($sources as $source) {
            $results[] = $this->resolveOne($course, $source, $allowGenerate, $guestReason);
        }

        return $results;
    }

    /**
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>
     */
    public function resolveOne(CourseIndex $course, array $source, bool $allowGenerate, string $guestReason = 'sign_in_required'): array
    {
        if (! $course->hasSource($source['sourceKind'], $source['sourceId'], $source['variant'])) {
            return $this->failed($source, 'unknown_source', 'That audio source is not part of this course revision.', false);
        }
        try {
            $recipe = $this->recipeFor($course, $source);
        } catch (SpeechProviderException $exception) {
            if ($exception->errorCode === 'provider_unconfigured') {
                // No provider bound: a previously recorded mapping (an imported manifest, an
                // earlier generation) can still serve a cache hit. Nothing here can generate.
                $recorded = $this->recordedResolution($course, $source);
                if ($recorded !== null) {
                    return $recorded;
                }
            }

            return $this->unavailable($source, $exception->errorCode, $exception->getMessage());
        }

        $asset = MandarinAudioAsset::query()->where('recipe_hash', $recipe->hash)->first();
        if ($asset !== null && $asset->isReady()) {
            $state = $this->objectState($asset);
            if ($state !== 'absent') {
                // `unknown` (disk unreachable) keeps the row ready: never regenerate on a transient storage error.
                $this->rememberSource($course, $source, $recipe->hash);

                return $state === 'present'
                    ? $this->ready($source, $asset)
                    : $this->failed($source, 'storage_unavailable', 'The audio store could not be reached. Try again in a moment.', true);
            }
            // A ready row whose object is verifiably gone is not ready; it needs bounded regeneration.
            $asset->forceFill(['state' => MandarinAudioAsset::STATE_FAILED, 'error_code' => 'asset_missing', 'error_message' => 'Stored object is missing.', 'disk' => null, 'object_key' => null])->save();
        }

        if ($asset !== null && in_array($asset->state, [MandarinAudioAsset::STATE_QUEUED, MandarinAudioAsset::STATE_GENERATING], true)) {
            return $this->pending($source, $asset);
        }

        $generationEnabled = $recipe->kind === 'sfx' || (bool) config('mandarin.speech.generation_enabled');
        if (! $generationEnabled) {
            return $this->unavailable($source, 'generation_disabled', 'Speech generation is disabled in this environment.');
        }
        if (! $allowGenerate) {
            return $this->unavailable($source, $guestReason, $guestReason === 'sign_in_required'
                ? 'Sign in to generate audio for this line. Already-generated lines stay playable for guests.'
                : 'Audio for this line has not been generated yet.');
        }
        if ($asset !== null && $asset->state === MandarinAudioAsset::STATE_FAILED) {
            $retryable = $asset->attempts < (int) config('mandarin.audio.max_attempts', 3) && $asset->error_code !== 'unsupported_voice' && $asset->error_code !== 'unsupported_language';
            if (! $retryable) {
                return $this->failed($source, (string) ($asset->error_code ?? 'provider_unavailable'), (string) ($asset->error_message ?? 'Generation failed.'), false);
            }
            // Explicit retry: re-queue the same row.
            $updated = MandarinAudioAsset::query()
                ->whereKey($asset->id)
                ->where('state', MandarinAudioAsset::STATE_FAILED)
                ->update(['state' => MandarinAudioAsset::STATE_QUEUED, 'lease_token' => null, 'lease_expires_at' => null, 'updated_at' => now()]);
            if ($updated === 1) {
                $this->dispatch($asset->id);
            }

            return $this->pending($source, $asset->refresh());
        }

        $asset = $this->claim($recipe);
        $this->rememberSource($course, $source, $recipe->hash);

        return $this->pending($source, $asset);
    }

    /**
     * Poll a known request. Never enqueues.
     *
     * @return array<string, mixed>|null
     */
    public function poll(CourseIndex $course, int $requestId): ?array
    {
        $asset = MandarinAudioAsset::query()->find($requestId);
        if ($asset === null) {
            return null;
        }
        $source = MandarinAudioSource::query()
            ->where('recipe_hash', $asset->recipe_hash)
            ->where('course_id', $course->courseId())
            ->where('content_version', $course->contentVersion())
            ->first();
        $ref = $source === null
            ? ['sourceKind' => 'utterance', 'sourceId' => 'unknown', 'variant' => 'normal']
            : ['sourceKind' => $source->source_kind, 'sourceId' => $source->source_id, 'variant' => $source->variant];

        return match ($asset->state) {
            MandarinAudioAsset::STATE_READY => match ($this->objectState($asset)) {
                'present' => $this->ready($ref, $asset),
                'unknown' => $this->failed($ref, 'storage_unavailable', 'The audio store could not be reached. Try again in a moment.', true),
                default => $this->failed($ref, 'asset_missing', 'Stored object is missing.', true),
            },
            MandarinAudioAsset::STATE_FAILED => $this->failed($ref, (string) ($asset->error_code ?? 'provider_unavailable'), (string) ($asset->error_message ?? 'Generation failed.'), $asset->attempts < (int) config('mandarin.audio.max_attempts', 3)),
            default => $this->pending($ref, $asset),
        };
    }

    /** Worker entry point: acquire the lease, synthesize, validate, store, publish under the lease. */
    public function generate(int $assetId): void
    {
        $leaseSeconds = (int) config('mandarin.audio.lease_seconds', 90);
        $token = Str::random(32);
        $now = now();
        $claimed = MandarinAudioAsset::query()
            ->whereKey($assetId)
            ->where(function ($query) use ($now): void {
                $query->where('state', MandarinAudioAsset::STATE_QUEUED)
                    ->orWhere(function ($stale) use ($now): void {
                        $stale->where('state', MandarinAudioAsset::STATE_GENERATING)->where('lease_expires_at', '<', $now);
                    });
            })
            ->update([
                'state' => MandarinAudioAsset::STATE_GENERATING,
                'lease_token' => $token,
                'lease_expires_at' => $now->copy()->addSeconds($leaseSeconds),
                'attempts' => DB::raw('attempts + 1'),
                'updated_at' => $now,
            ]);
        if ($claimed !== 1) {
            return; // Another worker holds it, or it is already ready/failed.
        }
        $asset = MandarinAudioAsset::query()->findOrFail($assetId);
        $recipe = $asset->recipeArray();

        try {
            if ($asset->kind === 'sfx') {
                $rendered = $this->sfx->render((string) $recipe['recipe']);
                $bytes = $rendered['bytes'];
                $contentType = $rendered['contentType'];
                $extension = $rendered['extension'];
                $metadata = ['renderer' => SfxRenderer::RECIPE_VERSION];
            } else {
                $text = (string) ($recipe['text'] ?? '');
                $request = new SpeechRequest($text, (string) ($recipe['variant'] ?? 'normal'), (string) ($recipe['role'] ?? 'narrator'));
                // Synthesize with the provider the recipe was hashed for, and refuse if its
                // configuration has drifted: the object must match its cache identity.
                $synthesizer = $this->synthesizerFor((string) ($recipe['provider'] ?? ''));
                $drift = $this->recipeDrift($recipe, $synthesizer->recipe($request));
                if ($drift !== null) {
                    $this->fail($asset, $token, 'unsupported_voice', "Provider configuration no longer matches this clip's recipe ({$drift}); resolve again to queue it under the current recipe.");

                    return;
                }
                if (! $this->budget->reserve(mb_strlen($text))) {
                    // Deferred, not attempted: do not spend one of the bounded provider attempts.
                    $this->fail($asset, $token, 'budget_exhausted', 'The daily speech generation budget is used up. Try again tomorrow.', true, false);

                    return;
                }
                $audio = $synthesizer->synthesize($request);
                $bytes = $audio->bytes;
                $contentType = $audio->contentType;
                $extension = $audio->extension;
                $metadata = $audio->providerMetadata + ['charactersBilled' => $audio->charactersBilled];
            }
        } catch (SpeechProviderException $exception) {
            $this->fail($asset, $token, $exception->errorCode, $exception->getMessage(), $exception->retryable);

            return;
        } catch (Throwable $exception) {
            Log::warning('mandarin audio generation error', ['asset' => $assetId, 'error' => $exception->getMessage()]);
            $this->fail($asset, $token, 'provider_unavailable', 'Generation failed unexpectedly.', true);

            return;
        }

        $check = $this->validator->validate(
            $bytes,
            $contentType,
            $asset->kind === 'sfx' ? 10 : (int) config('mandarin.audio.min_duration_ms', 150),
            (int) config('mandarin.audio.max_duration_ms', 20000),
            (int) config('mandarin.audio.max_bytes', 2_000_000),
        );
        if (! $check['ok']) {
            $this->fail($asset, $token, 'provider_unavailable', 'Provider returned invalid audio: '.implode('; ', $check['problems']), true);

            return;
        }

        $contentHash = hash('sha256', $bytes);
        $diskName = (string) config('mandarin.media_disk', 'local');
        $prefix = trim((string) config('mandarin.media_prefix', 'games/mandarin/audio'), '/');
        $key = "{$prefix}/".substr($asset->recipe_hash, 0, 2)."/{$asset->recipe_hash}-".substr($contentHash, 0, 12).".{$extension}";
        try {
            $written = Storage::disk($diskName)->put($key, $bytes);
            if ($written === false) {
                throw new \RuntimeException('put returned false');
            }
            $stored = Storage::disk($diskName)->size($key);
            if ($stored !== strlen($bytes)) {
                throw new \RuntimeException("stored size {$stored} != ".strlen($bytes));
            }
        } catch (Throwable $exception) {
            Log::warning('mandarin audio storage error', ['asset' => $assetId, 'error' => $exception->getMessage()]);
            $this->fail($asset, $token, 'storage_unavailable', 'Could not store the generated audio.', true);

            return;
        }

        // Publish only if we still hold the lease; a stale worker must not overwrite a newer attempt.
        $published = MandarinAudioAsset::query()
            ->whereKey($assetId)
            ->where('lease_token', $token)
            ->where('state', MandarinAudioAsset::STATE_GENERATING)
            ->update([
                'state' => MandarinAudioAsset::STATE_READY,
                'disk' => $diskName,
                'object_key' => $key,
                'content_hash' => $contentHash,
                'content_type' => $contentType,
                'bytes' => strlen($bytes),
                'duration_ms' => $check['durationMs'],
                'error_code' => null,
                'error_message' => null,
                'provider_metadata' => json_encode($metadata + ['validation' => $check['method']], JSON_UNESCAPED_UNICODE),
                'ready_at' => now(),
                'lease_token' => null,
                'lease_expires_at' => null,
                'updated_at' => now(),
            ]);
        if ($published !== 1) {
            // Lost the lease after upload: leave the object for conservative GC, never delete under a newer attempt.
            Log::notice('mandarin audio publish skipped: lease lost', ['asset' => $assetId, 'key' => $key]);
        }
    }

    /**
     * Bounded recovery for rows whose lease expired (worker crash, timeout).
     *
     * @return array{expired: int, requeued: int, failed: int}
     */
    public function recoverExpired(bool $execute): array
    {
        $stale = MandarinAudioAsset::query()
            ->where('state', MandarinAudioAsset::STATE_GENERATING)
            ->where('lease_expires_at', '<', now())
            ->get();
        $requeued = 0;
        $failed = 0;
        foreach ($stale as $asset) {
            $canRetry = $asset->attempts < (int) config('mandarin.audio.max_attempts', 3);
            if (! $execute) {
                $canRetry ? $requeued++ : $failed++;

                continue;
            }
            $updated = MandarinAudioAsset::query()->whereKey($asset->id)
                ->where('lease_token', $asset->lease_token)
                ->update($canRetry
                    ? ['state' => MandarinAudioAsset::STATE_QUEUED, 'lease_token' => null, 'lease_expires_at' => null, 'error_code' => 'lease_expired', 'error_message' => 'A previous attempt did not finish.', 'updated_at' => now()]
                    : ['state' => MandarinAudioAsset::STATE_FAILED, 'lease_token' => null, 'lease_expires_at' => null, 'error_code' => 'provider_unavailable', 'error_message' => 'Retry attempts exhausted after an unfinished generation.', 'updated_at' => now()]);
            if ($updated === 1 && $canRetry) {
                $this->dispatch($asset->id);
                $requeued++;
            } elseif ($updated === 1) {
                $failed++;
            }
        }

        return ['expired' => $stale->count(), 'requeued' => $requeued, 'failed' => $failed];
    }

    /**
     * Sources a node needs (teaching utterances, targets, exercise prompts, and optionally supports), for warming.
     *
     * @return list<array{sourceKind: string, sourceId: string, variant: string}>
     */
    public function sourcesForNode(CourseIndex $course, string $nodeId, string $variant, bool $includeSupport = false): array
    {
        $node = $course->nodes[$nodeId] ?? null;
        if ($node === null) {
            return [];
        }
        $sources = [];
        foreach ($node['teachingUtteranceIds'] as $id) {
            $sources[] = ['sourceKind' => 'utterance', 'sourceId' => $id, 'variant' => $variant];
        }
        foreach ($node['introducedTargetIds'] as $id) {
            $sources[] = ['sourceKind' => 'target', 'sourceId' => $id, 'variant' => $variant];
        }
        if ($includeSupport) {
            foreach ($node['introducedSupportIds'] as $id) {
                $sources[] = ['sourceKind' => 'support', 'sourceId' => $id, 'variant' => $variant];
            }
        }
        foreach ($node['exerciseIds'] as $exerciseId) {
            foreach ($course->exercises[$exerciseId]['promptAudio'] ?? [] as $ref) {
                $sources[] = ['sourceKind' => $ref['sourceKind'], 'sourceId' => $ref['sourceId'], 'variant' => $variant];
            }
        }
        $unique = [];
        foreach ($sources as $source) {
            $unique[$source['sourceKind'].':'.$source['sourceId'].':'.$source['variant']] = $source;
        }

        return array_values($unique);
    }

    /**
     * Read-only recipe and mapping status for a warm dry run. This computes the
     * provider recipe but never synthesizes, stores, enqueues, or writes a source row.
     *
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array{state: 'ready'|'missing'|'unavailable', recipeHash: string|null, mapped: bool, code: string|null}
     */
    public function inspectOne(CourseIndex $course, array $source): array
    {
        if (! $course->hasSource($source['sourceKind'], $source['sourceId'], $source['variant'])) {
            return ['state' => 'unavailable', 'recipeHash' => null, 'mapped' => false, 'code' => 'unknown_source'];
        }
        try {
            $recipe = $this->recipeFor($course, $source);
        } catch (SpeechProviderException $exception) {
            return ['state' => 'unavailable', 'recipeHash' => null, 'mapped' => false, 'code' => $exception->errorCode];
        }

        $ready = MandarinAudioAsset::query()
            ->where('recipe_hash', $recipe->hash)
            ->where('state', MandarinAudioAsset::STATE_READY)
            ->exists();
        $mapped = MandarinAudioSource::query()
            ->where('course_id', $course->courseId())
            ->where('content_version', $course->contentVersion())
            ->where('source_kind', $source['sourceKind'])
            ->where('source_id', $source['sourceId'])
            ->where('variant', $source['variant'])
            ->where('recipe_hash', $recipe->hash)
            ->exists();

        return ['state' => $ready ? 'ready' : 'missing', 'recipeHash' => $recipe->hash, 'mapped' => $mapped, 'code' => null];
    }

    // ── internals ────────────────────────────────────────────────────────────

    /** @param array{sourceKind: string, sourceId: string, variant: string} $source */
    public function recipeFor(CourseIndex $course, array $source): AudioRecipe
    {
        if ($source['sourceKind'] === 'sfx') {
            $recipeId = $course->sfxRecipe($source['sourceId']);
            if ($recipeId === null || ! SfxRenderer::has($recipeId)) {
                throw new SpeechProviderException('unknown_source', 'Unknown SFX recipe.');
            }

            return AudioRecipe::sfx($recipeId);
        }
        $text = $course->speechText($source['sourceKind'], $source['sourceId']);
        if ($text === null) {
            throw new SpeechProviderException('unknown_source', 'Unknown speech source.');
        }
        if (mb_strlen($text) > (int) config('mandarin.speech.max_text_length', 200)) {
            throw new SpeechProviderException('unsupported_language', 'Source text exceeds the synthesis length bound.');
        }
        $request = new SpeechRequest($text, $source['variant'], $course->roleFor($source['sourceKind'], $source['sourceId']));
        $providerRecipe = $this->speech->recipe($request);

        // Role is kept for regeneration but is NOT part of identity: two roles on one voice share the object.
        return AudioRecipe::speech($providerRecipe, $text)->withRole($request->role)->withVariant($request->variant);
    }

    private function claim(AudioRecipe $recipe): MandarinAudioAsset
    {
        try {
            $asset = DB::transaction(function () use ($recipe): MandarinAudioAsset {
                return MandarinAudioAsset::query()->create([
                    'recipe_hash' => $recipe->hash,
                    'provider' => $recipe->provider(),
                    'kind' => $recipe->kind,
                    'state' => MandarinAudioAsset::STATE_QUEUED,
                    'recipe' => json_encode($recipe->fields, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    'text_length' => mb_strlen($recipe->text() ?? ''),
                ]);
            });
            $this->dispatch($asset->id);

            return $asset;
        } catch (QueryException) {
            // Unique constraint: another request claimed it first. Reuse that row.
            return MandarinAudioAsset::query()->where('recipe_hash', $recipe->hash)->firstOrFail();
        }
    }

    private function dispatch(int $assetId): void
    {
        GenerateMandarinAudioJob::dispatch($assetId)->afterCommit();
    }

    /**
     * The ready asset a `mandarin_audio_sources` row maps this source to, if
     * any; null when there is no mapping or the mapped row is not ready. Read
     * only: never claims, enqueues, demotes or re-points anything.
     *
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>|null
     */
    private function recordedResolution(CourseIndex $course, array $source): ?array
    {
        $mapping = MandarinAudioSource::query()
            ->where('course_id', $course->courseId())
            ->where('content_version', $course->contentVersion())
            ->where('source_kind', $source['sourceKind'])
            ->where('source_id', $source['sourceId'])
            ->where('variant', $source['variant'])
            ->first();
        if ($mapping === null) {
            return null;
        }
        $asset = MandarinAudioAsset::query()->where('recipe_hash', (string) $mapping->recipe_hash)->first();
        if ($asset === null || ! $asset->isReady()) {
            return null;
        }

        return match ($this->objectState($asset)) {
            'present' => $this->ready($source, $asset),
            'unknown' => $this->failed($source, 'storage_unavailable', 'The audio store could not be reached. Try again in a moment.', true),
            default => null,
        };
    }

    /**
     * `present | absent | unknown` for a ready row. With `mandarin.audio.verify_objects`
     * off, a row on a disk that serves public URLs is trusted without a storage call
     * (the app may hold no read key for the bucket); local disks are always checked
     * because the media route has to read the bytes.
     */
    private function objectState(MandarinAudioAsset $asset): string
    {
        if (! (bool) config('mandarin.audio.verify_objects', true) && $this->delivery->hasPublicUrl($asset)) {
            return 'present';
        }

        return $this->delivery->objectState($asset);
    }

    /** @param array{sourceKind: string, sourceId: string, variant: string} $source */
    private function rememberSource(CourseIndex $course, array $source, string $recipeHash): void
    {
        MandarinAudioSource::query()->updateOrCreate([
            'course_id' => $course->courseId(),
            'content_version' => $course->contentVersion(),
            'source_kind' => $source['sourceKind'],
            'source_id' => $source['sourceId'],
            'variant' => $source['variant'],
        ], ['recipe_hash' => $recipeHash]);
    }

    private function fail(MandarinAudioAsset $asset, string $token, string $code, string $message, bool $retryable = false, bool $consumeAttempt = true): void
    {
        MandarinAudioAsset::query()->whereKey($asset->id)->where('lease_token', $token)->update([
            'state' => MandarinAudioAsset::STATE_FAILED,
            'error_code' => $code,
            'error_message' => Str::limit($message, 500),
            'lease_token' => null,
            'lease_expires_at' => null,
            'provider_metadata' => json_encode(['retryable' => $retryable]),
            'updated_at' => now(),
        ] + ($consumeAttempt ? [] : ['attempts' => DB::raw('CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END')]));
    }

    /** The bound synthesizer when it produced this recipe; otherwise the provider the recipe names. */
    private function synthesizerFor(string $provider): SpeechSynthesizer
    {
        return $this->speech->id() === $provider ? $this->speech : $this->providers->make($provider);
    }

    /**
     * Compares the stored provider settings with what the provider would use now.
     * Returns a description of the first difference, or null when they match.
     *
     * @param  array<string, mixed>  $stored
     * @param  array<string, scalar|null>  $current
     */
    private function recipeDrift(array $stored, array $current): ?string
    {
        foreach ($current as $key => $value) {
            if (! array_key_exists($key, $stored)) {
                continue;
            }
            if ((string) $stored[$key] !== (string) $value) {
                return "{$key}: stored ".json_encode($stored[$key]).', now '.json_encode($value);
            }
        }

        return null;
    }

    /**
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>
     */
    private function ready(array $source, MandarinAudioAsset $asset): array
    {
        $url = $this->delivery->url($asset);

        return [
            'state' => 'ready',
            'source' => $source,
            'assetId' => (string) $asset->id,
            'url' => $url['url'],
            'expiresAt' => $url['expiresAt'],
            'contentHash' => (string) $asset->content_hash,
            'contentType' => (string) $asset->content_type,
            'durationMs' => (int) $asset->duration_ms,
            'provenance' => $asset->kind === 'sfx' ? 'procedural_sfx' : 'synthesized_speech',
        ];
    }

    /**
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>
     */
    private function pending(array $source, MandarinAudioAsset $asset): array
    {
        return [
            'state' => $asset->state === MandarinAudioAsset::STATE_GENERATING ? 'generating' : 'queued',
            'source' => $source,
            'requestId' => (string) $asset->id,
            'pollUrl' => route('games.mandarin.audio.poll', ['request' => $asset->id], false),
            'retryAfterMs' => (int) config('mandarin.audio.poll_retry_ms', 1200),
        ];
    }

    /**
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>
     */
    private function failed(array $source, string $code, string $message, bool $retryable): array
    {
        return ['state' => 'failed', 'source' => $source, 'code' => $code, 'retryable' => $retryable, 'retryAfterMs' => $retryable ? 1500 : null, 'message' => $message];
    }

    /**
     * @param  array{sourceKind: string, sourceId: string, variant: string}  $source
     * @return array<string, mixed>
     */
    private function unavailable(array $source, string $code, string $message): array
    {
        return ['state' => 'unavailable', 'source' => $source, 'code' => $code, 'retryable' => false, 'retryAfterMs' => null, 'message' => $message];
    }
}
