<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioManifestService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Throwable;

/**
 * Writes the database half of a generated audio cache as a portable JSON
 * manifest: one entry per ready asset (recipe, disk, content-addressed key,
 * content hash, size, duration) plus the course source mappings that point at
 * them. Copying the objects to the shared bucket is only half a hand-off —
 * without these rows `resolve` has nothing to return a cache hit from.
 *
 * The file carries no credentials, no URLs, no absolute paths and no audio
 * bytes, so it is safe to move between machines alongside the objects.
 */
class AudioExportCommand extends Command
{
    protected $signature = 'mandarin:audio:export {path : Where to write the manifest JSON} {--disk= : Only export assets stored on this disk}';

    protected $description = 'Export ready Mandarin audio assets and their course source mappings as a JSON manifest.';

    public function handle(AudioManifestService $manifests): int
    {
        $path = trim((string) $this->argument('path'));
        if ($path === '') {
            $this->error('Pass the path to write the manifest to.');

            return self::FAILURE;
        }
        $disk = trim((string) $this->option('disk'));
        /** @var array<string, mixed> $disks */
        $disks = (array) config('filesystems.disks', []);
        if ($disk !== '' && ! array_key_exists($disk, $disks)) {
            // Names only; never the disk configuration, which holds credentials.
            $this->error("Unknown disk \"{$disk}\". Configured disks: ".implode(', ', array_keys($disks)).'.');

            return self::FAILURE;
        }

        $manifest = $manifests->export($disk === '' ? null : $disk);
        $json = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        try {
            File::ensureDirectoryExists(dirname($path));
            File::put($path, $json."\n");
        } catch (Throwable $exception) {
            $this->error('Could not write the manifest: '.class_basename($exception).'.');

            return self::FAILURE;
        }

        foreach ($manifest['courses'] as $course) {
            $this->line(sprintf('     %-22s %s', 'course', $course['courseId'].'@'.$course['contentVersion']));
        }
        $this->line(sprintf('     %-22s %s', 'assets sha256', substr($manifest['assetsHash'], 0, 16)));
        $this->info(sprintf(
            'Wrote %d ready asset(s) and %d source mapping(s) to %s.',
            $manifest['counts']['assets'],
            $manifest['counts']['sources'],
            $path,
        ));
        if ($manifest['counts']['assets'] === 0) {
            $this->warn('No ready assets matched; generate or warm the cache first.');
        }

        return self::SUCCESS;
    }
}
