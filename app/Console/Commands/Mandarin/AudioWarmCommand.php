<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Course\CourseRepository;
use Illuminate\Console\Command;

/**
 * Pre-generates a node's audio through the same resolver as lazy playback.
 * --dry-run makes no provider calls and enqueues nothing.
 */
class AudioWarmCommand extends Command
{
    protected $signature = 'mandarin:audio:warm {--node=s1n1 : Node id, or "all"} {--variant=normal : normal | slow | both} {--dry-run} {--execute} {--support : Also warm supporting glossary entries introduced in the selected nodes} {--sfx : Also render the four UI cues}';

    protected $description = 'Warm the audio cache for a node (operator prewarm; optional UX optimisation).';

    public function handle(CourseRepository $courses, AudioAssetService $assets): int
    {
        if (! $this->option('execute') && ! $this->option('dry-run')) {
            $this->error('Pass --dry-run to list sources or --execute to enqueue generation.');

            return self::FAILURE;
        }
        $course = $courses->publishedOrFail();
        $nodes = $this->option('node') === 'all' ? $course->nodeOrder : [(string) $this->option('node')];
        $variants = $this->option('variant') === 'both' ? ['normal', 'slow'] : [(string) $this->option('variant')];
        $sources = [];
        foreach ($nodes as $nodeId) {
            foreach ($variants as $variant) {
                foreach ($assets->sourcesForNode($course, $nodeId, $variant, (bool) $this->option('support')) as $source) {
                    $sources[$source['sourceKind'].':'.$source['sourceId'].':'.$source['variant']] = $source;
                }
            }
        }
        if ($this->option('sfx')) {
            foreach (array_keys($course->sfx) as $sfxId) {
                $sources["sfx:{$sfxId}:default"] = ['sourceKind' => 'sfx', 'sourceId' => $sfxId, 'variant' => 'default'];
            }
        }
        $sources = array_values($sources);
        $this->info(count($sources).' source(s) for node(s) '.implode(',', $nodes).' ['.implode(',', $variants).']');
        if ($this->option('dry-run')) {
            $tally = [];
            foreach ($sources as $source) {
                $inspection = $assets->inspectOne($course, $source);
                $tally[$inspection['state']] = ($tally[$inspection['state']] ?? 0) + 1;
                $mapping = $inspection['mapped'] ? 'mapped' : 'mapping-missing';
                $detail = $inspection['recipeHash'] === null
                    ? (string) $inspection['code']
                    : substr($inspection['recipeHash'], 0, 12).' '.$mapping;
                $this->line(" - {$source['sourceKind']}:{$source['sourceId']}:{$source['variant']} {$inspection['state']} {$detail}");
            }
            foreach ($tally as $state => $count) {
                $this->line(sprintf('%-11s %d', $state, $count));
            }

            return self::SUCCESS;
        }
        $tally = [];
        foreach (array_chunk($sources, 16) as $chunk) {
            foreach ($assets->resolve($course, $chunk, true, 'generation_disabled') as $result) {
                $tally[$result['state']] = ($tally[$result['state']] ?? 0) + 1;
                if ($result['state'] === 'failed' || $result['state'] === 'unavailable') {
                    $this->warn(" - {$result['source']['sourceKind']}:{$result['source']['sourceId']}:{$result['source']['variant']} {$result['state']} {$result['code']}: {$result['message']}");
                }
            }
        }
        foreach ($tally as $state => $count) {
            $this->line(sprintf('%-11s %d', $state, $count));
        }
        if (($tally['queued'] ?? 0) + ($tally['generating'] ?? 0) > 0) {
            $this->info('Enqueued (not yet ready). Run the queue worker: php artisan queue:work --queue='.config('mandarin.audio.queue').' --stop-when-empty');
        }

        return self::SUCCESS;
    }
}
