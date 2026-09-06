<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Models\Mandarin\MandarinAudioAsset;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ready object → playable URL / response. Never calls a provider. Local disks
 * are served through the controlled media route (Range-capable); S3-style
 * disks hand out short-lived temporary URLs.
 */
class AudioDeliveryService
{
    public const URL_TTL_MINUTES = 60;

    /** @return array{url: string, expiresAt: string|null} */
    public function url(MandarinAudioAsset $asset): array
    {
        $disk = $this->disk($asset);
        if ($disk instanceof FilesystemAdapter && $this->isLocalDriver($asset)) {
            return [
                'url' => route('games.mandarin.media', ['asset' => $asset->id, 'hash' => (string) $asset->content_hash, 'extension' => $this->extension($asset)]),
                'expiresAt' => null,
            ];
        }
        // A disk with a public base URL (e.g. an R2 bucket behind a custom domain) serves the
        // original curriculum bytes directly: content-hashed keys, no expiry, CDN-cacheable.
        if ($disk instanceof FilesystemAdapter && $this->hasPublicUrl($asset)) {
            return ['url' => $disk->url((string) $asset->object_key), 'expiresAt' => null];
        }
        $expires = now()->addMinutes(self::URL_TTL_MINUTES);

        return [
            'url' => $disk instanceof FilesystemAdapter ? $disk->temporaryUrl((string) $asset->object_key, $expires) : '',
            'expiresAt' => $expires->toIso8601String(),
        ];
    }

    /** True when the asset's disk is configured with a public `url` base. */
    public function hasPublicUrl(MandarinAudioAsset $asset): bool
    {
        $url = config("filesystems.disks.{$asset->disk}.url");

        return is_string($url) && $url !== '' && ! $this->isLocalDriver($asset);
    }

    /** True when the recorded object is actually present on its recorded disk. */
    public function objectExists(MandarinAudioAsset $asset): bool
    {
        return $this->objectState($asset) === 'present';
    }

    /**
     * `present` / `absent` are verified answers; `unknown` means the disk could not be
     * queried (missing credentials, network) and must not be treated as absent, or a
     * transient storage error would demote ready rows and trigger paid regeneration.
     */
    public function objectState(MandarinAudioAsset $asset): string
    {
        if ($asset->disk === null || $asset->object_key === null) {
            return 'absent';
        }
        try {
            return $this->disk($asset)->exists($asset->object_key) ? 'present' : 'absent';
        } catch (\Throwable $exception) {
            Log::warning('mandarin audio: could not check object', ['asset' => $asset->id, 'disk' => $asset->disk, 'error' => $exception->getMessage()]);

            return 'unknown';
        }
    }

    public function respond(MandarinAudioAsset $asset): Response
    {
        $disk = $this->disk($asset);
        $headers = [
            'Content-Type' => (string) $asset->content_type,
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ];
        if ($disk instanceof FilesystemAdapter && $this->isLocalDriver($asset)) {
            // BinaryFileResponse honours Range requests, which Safari needs for <audio>.
            return response()->file($disk->path((string) $asset->object_key), $headers);
        }

        return redirect()->away($this->url($asset)['url']);
    }

    public function extension(MandarinAudioAsset $asset): string
    {
        return match ($asset->content_type) {
            'audio/mpeg' => 'mp3',
            'audio/mp4' => 'm4a',
            'audio/wav' => 'wav',
            default => 'bin',
        };
    }

    private function disk(MandarinAudioAsset $asset): Filesystem
    {
        return Storage::disk((string) $asset->disk);
    }

    private function isLocalDriver(MandarinAudioAsset $asset): bool
    {
        return (string) config("filesystems.disks.{$asset->disk}.driver") === 'local';
    }
}
