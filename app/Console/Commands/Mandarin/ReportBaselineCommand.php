<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Progress\BaselineReport;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Read-only, anonymised evaluation baseline (issue #103). Prints no user,
 * event or session identifier in either output format.
 */
class ReportBaselineCommand extends Command
{
    protected $signature = 'mandarin:report:baseline
        {--since= : First day to count (YYYY-MM-DD)}
        {--until= : Last day to count, inclusive (YYYY-MM-DD)}
        {--course= : Course id (defaults to config mandarin.course.id)}
        {--time-basis=accepted : accepted (server accepted_at) or client (client-reported, untrusted)}
        {--json : Machine-readable output}';

    protected $description = 'Read-only anonymised baseline of Mandarin practice: activity, comprehension, checkpoint, delayed recall, help dependence, lapses.';

    public function handle(BaselineReport $report): int
    {
        $basis = (string) $this->option('time-basis');
        if (! in_array($basis, [BaselineReport::BASIS_ACCEPTED, BaselineReport::BASIS_CLIENT], true)) {
            $this->error('--time-basis must be "accepted" or "client".');

            return self::FAILURE;
        }
        $since = $this->date('since');
        $until = $this->date('until');
        if ($since === false || $until === false) {
            return self::FAILURE;
        }
        $course = (string) ($this->option('course') ?: config('mandarin.course.id'));

        $data = $report->build($course, $since, $until, $basis);

        if ($this->option('json')) {
            $this->line((string) json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        $this->info("Mandarin baseline: {$data['courseId']} ({$data['timeBasisLabel']} time)");
        $this->line('Window: '.($data['since'] ?? 'start').' to '.($data['until'] ?? 'now').'; preview mode excluded.');
        foreach ($data['notes'] as $note) {
            $this->line("Note: {$note}");
        }
        if ($data['learnerCount'] === 0) {
            $this->warn('No practice events in the window.');
        }
        foreach ([...$data['learners'], $data['total']] as $block) {
            $this->printBlock($block);
        }

        return self::SUCCESS;
    }

    private function date(string $option): Carbon|false|null
    {
        $value = $this->option($option);
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            return Carbon::createFromFormat('!Y-m-d', $value) ?: throw new \InvalidArgumentException;
        } catch (Throwable) {
            $this->error("--{$option} must be a date like 2026-10-01.");

            return false;
        }
    }

    /** @param  array<string, mixed>  $b */
    private function printBlock(array $b): void
    {
        $this->newLine();
        $this->info((string) $b['label']);
        $a = $b['activity'];
        $this->line(sprintf('  Activity: %d session(s), %d active day(s), %s to %s, %d response event(s)', $a['sessions'], $a['activeDays'], $a['firstActivity'] ?? '-', $a['lastActivity'] ?? '-', $a['responseEvents']));
        $c = $b['comprehension'];
        $this->line('  Comprehension (lesson/review, correct rate):');
        $this->line('    unaided          '.$this->rate($c['unaided']));
        $this->line('    replay-assisted  '.$this->rate($c['replayAssisted']));
        $this->line('    text-assisted    '.$this->rate($c['textAssisted']));
        $this->line("    don't know: {$c['dontKnow']}, skip: {$c['skip']}");
        $this->line('  Checkpoint responses:');
        foreach (['firstExposure' => 'first exposure', 'replayAssisted' => 'replay-assisted', 'textAssisted' => 'text-assisted', 'previouslyExposed' => 'previously exposed'] as $key => $label) {
            $this->line(sprintf('    %-18s %s', $label, $this->rate($b['checkpoint'][$key])));
        }
        $this->line('  Delayed recall (unaided correct rate by gap since previous scored response on the target):');
        $this->line('    1 to <7 days     '.$this->rate($b['delayedRecall']['oneToSevenDays']));
        $this->line('    7+ days          '.$this->rate($b['delayedRecall']['sevenDaysPlus']));
        $h = $b['helpDependence'];
        $this->line(sprintf('  Help: %s help_revealed per 100 responses; %s of responses used text or pinyin help', $h['helpRevealedPer100Responses'] ?? '-', $h['textOrPinyinShare'] === null ? '-' : round($h['textOrPinyinShare'] * 100, 1).'%'));
        $this->line("  Lapses: {$b['lapses']['targetsIncorrectAfterGood']} target(s) answered incorrectly after an earlier Good");
    }

    /** @param  array{n: int, correct: int, rate: float|null}  $r */
    private function rate(array $r): string
    {
        return $r['rate'] === null ? 'n=0' : sprintf('%.1f%% (%d/%d)', $r['rate'] * 100, $r['correct'], $r['n']);
    }
}
