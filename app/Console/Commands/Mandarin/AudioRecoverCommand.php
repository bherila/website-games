<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioAssetService;
use Illuminate\Console\Command;

class AudioRecoverCommand extends Command
{
    protected $signature = 'mandarin:audio:recover {--dry-run} {--execute}';

    protected $description = 'Requeue or fail audio rows whose generation lease expired (bounded by max attempts).';

    public function handle(AudioAssetService $assets): int
    {
        if (! $this->option('execute') && ! $this->option('dry-run')) {
            $this->error('Pass --dry-run or --execute.');

            return self::FAILURE;
        }
        $result = $assets->recoverExpired((bool) $this->option('execute'));
        $this->info(sprintf('%s: %d expired lease(s); %d to requeue, %d to fail', $this->option('execute') ? 'Recovered' : 'Dry run', $result['expired'], $result['requeued'], $result['failed']));

        return self::SUCCESS;
    }
}
