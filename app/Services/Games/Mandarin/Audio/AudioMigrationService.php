<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Models\Mandarin\MandarinAudioAsset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Moves ready audio objects from the disk they were written to onto another
 * configured disk. Object keys are content-addressed and therefore stable, so
 * a migration is a verified copy plus a conditional row update — never a
 * rewrite of the recipe, the hash or the key.
 *
 * The row is only pointed at the target after the bytes have been read back
 * *from the target* and matched against `content_hash`, so a partial or
 * corrupted copy can never be published as ready. The source object is kept
 * unless the operator explicitly asks for it, which makes the whole command
 * safe to re-run and safe to abandon half way through.
 */
class AudioMigrationService
{
    /**
     * Ready rows that are not on the target disk yet, oldest first.
     *
     * @return list<array{id: int, disk: string, objectKey: string, bytes: int}>
     */
    public function pending(string $target, ?int $limit = null): array
    {
        $rows = [];
        foreach ($this->query($target, $limit)->get() as $asset) {
            $rows[] = [
                'id' => $asset->id,
                'disk' => (string) $asset->disk,
                'objectKey' => (string) $asset->object_key,
                'bytes' => (int) $asset->bytes,
            ];
        }

        return $rows;
    }

    /**
     * Copy, verify and re-point every pending row. A row that cannot be
     * verified is reported and left exactly where it was; it never aborts the
     * run, so one bad object does not strand the rest.
     *
     * @return array{target: string, scanned: int, migrated: int, skipped: int, sourcesDeleted: int, problems: list<array{id: int, disk: string, reason: string}>}
     */
    public function migrate(string $target, ?int $limit = null, bool $deleteSource = false): array
    {
        $scanned = 0;
        $migrated = 0;
        $skipped = 0;
        $sourcesDeleted = 0;
        /** @var list<array{id: int, disk: string, reason: string}> $problems */
        $problems = [];

        foreach ($this->query($target, $limit)->get() as $asset) {
            $scanned++;
            $sourceDisk = (string) $asset->disk;
            $outcome = $this->moveOne($asset, $target, $deleteSource);
            if ($outcome['ok']) {
                $migrated++;
                if ($outcome['sourceDeleted']) {
                    $sourcesDeleted++;
                }

                continue;
            }
            $skipped++;
            $problems[] = ['id' => $asset->id, 'disk' => $sourceDisk, 'reason' => $outcome['reason']];
        }

        return [
            'target' => $target,
            'scanned' => $scanned,
            'migrated' => $migrated,
            'skipped' => $skipped,
            'sourcesDeleted' => $sourcesDeleted,
            'problems' => $problems,
        ];
    }

    /** Whether a disk name is actually configured; an unknown target is an operator error. */
    public function isConfiguredDisk(string $disk): bool
    {
        $disks = config('filesystems.disks');

        return is_array($disks) && array_key_exists($disk, $disks);
    }

    // ── internals ────────────────────────────────────────────────────────────

    /** @return Builder<MandarinAudioAsset> */
    private function query(string $target, ?int $limit): Builder
    {
        $query = MandarinAudioAsset::query()
            ->where('state', MandarinAudioAsset::STATE_READY)
            ->whereNotNull('disk')
            ->whereNotNull('object_key')
            ->whereNotNull('content_hash')
            ->where('disk', '!=', $target)
            ->orderBy('id');
        if ($limit !== null && $limit > 0) {
            $query->limit($limit);
        }

        return $query;
    }

    /** @return array{ok: bool, reason: string, sourceDeleted: bool} */
    private function moveOne(MandarinAudioAsset $asset, string $target, bool $deleteSource): array
    {
        $sourceDisk = (string) $asset->disk;
        $key = (string) $asset->object_key;
        $hash = (string) $asset->content_hash;

        try {
            $bytes = $this->read($sourceDisk, $key);
            if ($bytes === null) {
                return $this->problem("source object is missing on {$sourceDisk}");
            }
            if (hash('sha256', $bytes) !== $hash) {
                return $this->problem("source bytes on {$sourceDisk} do not match content_hash");
            }
            if (Storage::disk($target)->put($key, $bytes) === false) {
                return $this->problem("{$target} refused the write");
            }
            // Read back from the target: a write that reports success can still
            // have landed truncated or been silently rewritten.
            $copied = $this->read($target, $key);
            if ($copied === null || strlen($copied) !== strlen($bytes) || hash('sha256', $copied) !== $hash) {
                Storage::disk($target)->delete($key);

                return $this->problem("copy on {$target} did not verify");
            }
        } catch (Throwable $exception) {
            // Never echo the message: a storage exception can carry a signed URL.
            Log::warning('mandarin audio migration storage error', ['asset' => $asset->id, 'target' => $target, 'error' => $exception->getMessage()]);

            return $this->problem('storage error ('.class_basename($exception).'); see the log');
        }

        // Conditional: only re-point a row that is still the ready row we verified.
        $updated = MandarinAudioAsset::query()
            ->whereKey($asset->id)
            ->where('state', MandarinAudioAsset::STATE_READY)
            ->where('disk', $sourceDisk)
            ->where('content_hash', $hash)
            ->update(['disk' => $target, 'updated_at' => now()]);
        if ($updated !== 1) {
            // Regenerated or demoted under us. The copy is content-addressed, so leaving it is harmless.
            return $this->problem('row changed during migration; disk left unchanged');
        }

        $sourceDeleted = false;
        if ($deleteSource) {
            try {
                Storage::disk($sourceDisk)->delete($key);
                $sourceDeleted = true;
            } catch (Throwable $exception) {
                Log::notice('mandarin audio migration could not delete the source object', ['asset' => $asset->id, 'disk' => $sourceDisk, 'error' => $exception->getMessage()]);
            }
        }

        return ['ok' => true, 'reason' => '', 'sourceDeleted' => $sourceDeleted];
    }

    /** @return array{ok: bool, reason: string, sourceDeleted: bool} */
    private function problem(string $reason): array
    {
        return ['ok' => false, 'reason' => $reason, 'sourceDeleted' => false];
    }

    private function read(string $disk, string $key): ?string
    {
        $filesystem = Storage::disk($disk);
        if (! $filesystem->exists($key)) {
            return null;
        }

        return $filesystem->get($key);
    }
}
