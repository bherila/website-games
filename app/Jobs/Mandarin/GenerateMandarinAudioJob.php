<?php

namespace App\Jobs\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioAssetService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * One generation attempt for one asset row. Retries are governed by the
 * asset's own attempt counter and lease, not by queue retries, so a duplicate
 * delivery is harmless: the worker re-checks state and the lease first.
 */
class GenerateMandarinAudioJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout;

    public function __construct(public readonly int $assetId)
    {
        $this->onQueue((string) config('mandarin.audio.queue', 'mandarin-audio'));
        // The job must give up before its lease expires so a recovered attempt never overlaps it.
        $this->timeout = max(10, (int) config('mandarin.audio.lease_seconds', 90) - 10);
    }

    public function handle(AudioAssetService $assets): void
    {
        $assets->generate($this->assetId);
    }
}
