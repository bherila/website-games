<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioMigrationService;
use Illuminate\Console\Command;

/**
 * Moves already-generated audio onto another disk (typically local → s3 when a
 * single-host deployment grows a second host). Nothing is regenerated and no
 * provider is called: object keys are content-addressed, so this is a verified
 * copy plus a conditional row update. Re-running it finds nothing left to do.
 */
class AudioMigrateCommand extends Command
{
    protected $signature = 'mandarin:audio:migrate {--to= : Target disk name from config/filesystems.php} {--dry-run} {--execute} {--limit=0 : Process at most this many rows (0 = all)} {--delete-source : Delete the source object after a verified move}';

    protected $description = 'Copy ready Mandarin audio objects to another disk and re-point the rows, verifying every byte.';

    public function handle(AudioMigrationService $migrations): int
    {
        $target = trim((string) $this->option('to'));
        if ($target === '') {
            $this->error('Pass --to=<disk> naming a disk from config/filesystems.php.');

            return self::FAILURE;
        }
        if (! $migrations->isConfiguredDisk($target)) {
            // Names only; never the disk configuration, which holds credentials.
            $this->error("Unknown disk \"{$target}\". Configured disks: ".implode(', ', array_keys((array) config('filesystems.disks', []))).'.');

            return self::FAILURE;
        }
        if (! $this->option('execute') && ! $this->option('dry-run')) {
            $this->error('Pass --dry-run to list what would move or --execute to move it.');

            return self::FAILURE;
        }
        $limit = max(0, (int) $this->option('limit'));

        if ($this->option('dry-run')) {
            $pending = $migrations->pending($target, $limit);
            $this->info(count($pending)." ready asset(s) would move to \"{$target}\".");
            foreach ($pending as $row) {
                $this->line(sprintf(' - #%d %s %s (%d bytes)', $row['id'], $row['disk'], $row['objectKey'], $row['bytes']));
            }

            return self::SUCCESS;
        }

        $result = $migrations->migrate($target, $limit, (bool) $this->option('delete-source'));
        foreach ($result['problems'] as $problem) {
            $this->warn(sprintf(' - #%d (%s) skipped: %s', $problem['id'], $problem['disk'], $problem['reason']));
        }
        $this->info(sprintf(
            'Migrated %d of %d ready asset(s) to "%s"; %d skipped; %d source object(s) deleted.',
            $result['migrated'],
            $result['scanned'],
            $result['target'],
            $result['skipped'],
            $result['sourcesDeleted'],
        ));
        if ($result['skipped'] > 0) {
            $this->warn('Skipped rows kept their existing disk; nothing was marked ready on the target.');
        }

        return self::SUCCESS;
    }
}
