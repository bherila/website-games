<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioManifestService;
use Illuminate\Console\Command;
use InvalidArgumentException;

/**
 * Recreates the `mandarin_audio_assets` / `mandarin_audio_sources` rows a
 * manifest describes, so an environment that already has the objects can serve
 * cache hits with no speech provider configured and generation off.
 *
 * It only ever publishes: a ready row whose content hash differs is reported as
 * a conflict and left exactly as it is, never downgraded. `--verify-objects`
 * refuses to mark anything ready whose object is not actually on the disk, and
 * re-running an executed import writes nothing.
 */
class AudioImportCommand extends Command
{
    protected $signature = 'mandarin:audio:import {path : Manifest written by mandarin:audio:export} {--dry-run} {--execute} {--verify-objects : Check every object on its disk before marking the row ready} {--strict : Fail when any asset or source mapping is skipped}';

    protected $description = 'Import a Mandarin audio manifest: recreate ready asset rows and their course source mappings.';

    public function handle(AudioManifestService $manifests): int
    {
        if (! $this->option('execute') && ! $this->option('dry-run')) {
            $this->error('Pass --dry-run to list what would change or --execute to write it.');

            return self::FAILURE;
        }
        try {
            $manifest = $manifests->parseFile(trim((string) $this->argument('path')));
        } catch (InvalidArgumentException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $unknownDisks = $manifests->unknownDisks($manifest);
        if ($unknownDisks !== []) {
            /** @var array<string, mixed> $disks */
            $disks = (array) config('filesystems.disks', []);
            // Names only; never the disk configuration, which holds credentials.
            $this->error('The manifest stores audio on unconfigured disk(s): '.implode(', ', $unknownDisks).'. Configured disks: '.implode(', ', array_keys($disks)).'.');

            return self::FAILURE;
        }
        $missingRevisions = $manifests->missingRevisions($manifest);
        if ($missingRevisions !== []) {
            $this->error('No imported course revision for: '.implode(', ', $missingRevisions).'. Run `php artisan mandarin:course:import` first.');

            return self::FAILURE;
        }
        $invalidSources = $manifests->invalidSources($manifest);
        if ($invalidSources !== []) {
            $this->error('The manifest references source(s) outside their course revision: '.implode(', ', $invalidSources).'.');

            return self::FAILURE;
        }

        $execute = (bool) $this->option('execute');
        $this->line(sprintf(
            'Manifest: schema %d, exported %s, %d asset(s), %d source mapping(s).',
            $manifest['schemaVersion'],
            $manifest['exportedAt'] === '' ? 'at an unrecorded time' : $manifest['exportedAt'],
            $manifest['counts']['assets'],
            $manifest['counts']['sources'],
        ));

        $result = $manifests->import($manifest, $execute, (bool) $this->option('verify-objects'));
        foreach (['inserted', 'refreshed', 'unchanged'] as $bucket) {
            if ($result['examples'][$bucket] !== []) {
                $this->line(sprintf('     %-22s %s', $bucket, implode(', ', $result['examples'][$bucket]).($result[$bucket] > count($result['examples'][$bucket]) ? ', …' : '')));
            }
        }
        foreach ($result['problems'] as $problem) {
            $this->warn(sprintf(' - %s skipped: %s', substr($problem['recipeHash'], 0, 12), $problem['reason']));
        }

        $this->info(sprintf(
            $execute
                ? 'Inserted %d, refreshed %d, left %d unchanged, skipped %d conflict(s) and %d unverified object(s); %d source mapping(s) written.'
                : 'Would insert %d, refresh %d, leave %d unchanged, skip %d conflict(s) and %d unverified object(s); %d source mapping(s) would change.',
            $result['inserted'],
            $result['refreshed'],
            $result['unchanged'],
            $result['conflicts'],
            $result['missing'],
            $result['sourcesWritten'],
        ));
        if ($result['sourcesSkipped'] > 0) {
            $this->warn($result['sourcesSkipped'].' source mapping(s) were skipped because their asset was not imported.');
        }
        if (! $execute) {
            $this->line('Nothing was written (--dry-run).');
        }

        if ($this->option('strict') && ($result['conflicts'] > 0 || $result['missing'] > 0 || $result['sourcesSkipped'] > 0)) {
            $this->error('Strict import failed because the manifest was not imported completely.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
