<?php

namespace App\Console\Commands\Mandarin;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Services\Games\Mandarin\Audio\GenerationBudget;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Speech\ProcessRunner;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Distinguishes "no course", "no provider", "provider cannot synthesize",
 * "queue unavailable", "storage unavailable" and "generation disabled" so an
 * empty-audio game is diagnosable in one command. Never prints credentials.
 */
class AudioDoctorCommand extends Command
{
    protected $signature = 'mandarin:audio:doctor';

    protected $description = 'Check the Mandarin audio pipeline: course, provider, storage, queue, budget, asset counts.';

    public function handle(CourseRepository $courses, SpeechSynthesizer $speech, GenerationBudget $budget, ProcessRunner $runner): int
    {
        $healthy = true;
        $check = function (string $label, bool $ok, string $detail) use (&$healthy): void {
            $this->line(sprintf('%s %-22s %s', $ok ? '<info>OK  </info>' : '<error>FAIL</error>', $label, $detail));
            $healthy = $healthy && $ok;
        };

        $course = $courses->published();
        $check('course', $course !== null, $course === null ? 'no published revision — run mandarin:course:import' : $course->courseId().'@'.$course->contentVersion());

        $this->line(sprintf('     %-22s %s', 'provider', $speech->id()));
        $probe = $speech->probe();
        $check('provider probe', $probe->ok, $probe->ok ? json_encode($probe->details, JSON_UNESCAPED_UNICODE) : implode(' | ', $probe->problems));
        $enabled = (bool) config('mandarin.speech.generation_enabled');
        $check('generation enabled', $enabled, $enabled ? 'MANDARIN_GENERATION_ENABLED=true' : 'MANDARIN_GENERATION_ENABLED is false: every speech miss returns generation_disabled');

        $disk = (string) config('mandarin.media_disk');
        try {
            $probeKey = trim((string) config('mandarin.media_prefix'), '/').'/.doctor-'.bin2hex(random_bytes(4));
            Storage::disk($disk)->put($probeKey, 'ok');
            $roundTrip = Storage::disk($disk)->get($probeKey) === 'ok';
            Storage::disk($disk)->delete($probeKey);
            $check('storage', $roundTrip, "disk={$disk} driver=".config("filesystems.disks.{$disk}.driver"));
        } catch (Throwable $exception) {
            $check('storage', false, "disk={$disk}: ".$exception->getMessage());
        }

        $queue = (string) config('queue.default');
        try {
            $queueOk = $queue !== 'sync' || app()->environment('local', 'testing');
            if ($queue === 'database') {
                DB::table('jobs')->count();
            }
            $check('queue', $queueOk, "connection={$queue} queue=".config('mandarin.audio.queue').($queue === 'sync' ? ' (sync: generation runs inside the web request — fine locally, not for production)' : ' — run `php artisan queue:work --queue='.config('mandarin.audio.queue').'`'));
        } catch (Throwable $exception) {
            $check('queue', false, $exception->getMessage());
        }

        $ffprobe = (string) config('mandarin.audio.ffprobe');
        $probeResult = $runner->run([$ffprobe, '-version'], 10);
        $check('ffprobe', $probeResult->ok(), $probeResult->ok() ? strtok($probeResult->stdout, "\n") ?: $ffprobe : "{$ffprobe} not runnable — duration validation falls back to container checks");

        $this->line(sprintf('     %-22s used %d / %d characters today', 'budget', $budget->used(), (int) config('mandarin.speech.daily_character_budget')));
        $counts = MandarinAudioAsset::query()->selectRaw('state, count(*) as n')->groupBy('state')->pluck('n', 'state');
        $this->line(sprintf('     %-22s ready=%d queued=%d generating=%d failed=%d', 'assets', $counts['ready'] ?? 0, $counts['queued'] ?? 0, $counts['generating'] ?? 0, $counts['failed'] ?? 0));
        $stale = MandarinAudioAsset::query()->where('state', 'generating')->where('lease_expires_at', '<', now())->count();
        if ($stale > 0) {
            $this->warn("{$stale} generating row(s) have an expired lease — run mandarin:audio:recover --execute");
        }

        return $healthy ? self::SUCCESS : self::FAILURE;
    }
}
