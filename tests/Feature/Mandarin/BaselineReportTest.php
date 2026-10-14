<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class BaselineReportTest extends MandarinTestCase
{
    private int $seq = 0;

    private const T0 = '2026-10-01 12:00:00';

    /** @param  array<string, mixed>  $o */
    private function event(User $user, array $o = []): MandarinPracticeEvent
    {
        $at = Carbon::parse($o['at'] ?? self::T0);
        $payload = [
            'sessionId' => $o['session'] ?? 'secret-session-a',
            'responseAction' => $o['action'] ?? 'answer',
            'attemptIndex' => $o['attempt'] ?? 0,
            'selfRating' => $o['rating'] ?? null,
            'textHelpUsed' => $o['text'] ?? false,
            'pinyinHelpUsed' => $o['pinyin'] ?? false,
            'audioEvidence' => ['status' => 'completed', 'normalPlayCount' => $o['normal'] ?? 1, 'slowPlayCount' => $o['slow'] ?? 0, 'interrupted' => false],
        ];
        $this->seq++;

        return MandarinPracticeEvent::query()->create([
            'user_id' => $user->id,
            'client_event_id' => 'secret-evt-'.$this->seq,
            'sequence' => $this->seq,
            'course_id' => $o['course'] ?? 'mandarin-foundations',
            'content_version' => '1.1.1',
            'kind' => $o['kind'] ?? 'response',
            'mode' => $o['mode'] ?? 'lesson',
            // Each event is its own showing unless a test shares an opportunity on purpose.
            'opportunity_id' => $o['opportunity'] ?? 'opp-'.$this->seq,
            'exercise_id' => $o['exercise'] ?? 'e001',
            'target_id' => $o['target'] ?? 't1',
            'correctness' => array_key_exists('correctness', $o) ? $o['correctness'] : 'correct',
            'grade' => $o['grade'] ?? null,
            'schedule_eligible' => $o['eligible'] ?? false,
            'schema_version' => $o['schema'] ?? 1,
            'card_key' => $o['card'] ?? null,
            'payload_hash' => hash('sha256', (string) $this->seq),
            'payload' => json_encode($payload),
            'client_occurred_at' => array_key_exists('client', $o) && $o['client'] === null ? null : Carbon::parse($o['client'] ?? $o['at'] ?? self::T0),
            'accepted_at' => $at,
        ]);
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    private function report(array $options = []): array
    {
        $this->assertSame(0, Artisan::call('mandarin:report:baseline', $options + ['--json' => true]));
        /** @var array<string, mixed> $data */
        $data = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

        return $data;
    }

    public function test_comprehension_buckets_and_dont_know_skip(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['target' => 'a']); // unaided correct
        $this->event($u, ['target' => 'b', 'correctness' => 'incorrect']); // unaided wrong
        $this->event($u, ['target' => 'c', 'normal' => 2]); // replay
        $this->event($u, ['target' => 'd', 'slow' => 1, 'correctness' => 'incorrect']); // replay
        $this->event($u, ['target' => 'e', 'pinyin' => true]); // text
        $this->event($u, ['target' => 'f', 'text' => true, 'normal' => 3]); // text beats replay
        $this->event($u, ['target' => 'g', 'action' => 'dont_know', 'correctness' => 'incorrect']);
        $this->event($u, ['target' => 'h', 'action' => 'skip', 'correctness' => 'unscored']);
        $this->event($u, ['target' => 'i', 'mode' => 'extra_practice']); // not comprehension

        $c = $this->report()['total']['comprehension'];
        $this->assertSame(['n' => 3, 'correct' => 1, 'rate' => 0.3333], $c['unaided']); // a, b, g
        $this->assertSame(['n' => 2, 'correct' => 1, 'rate' => 0.5], $c['replayAssisted']);
        $this->assertSame(['n' => 2, 'correct' => 2, 'rate' => 1], $c['textAssisted']);
        $this->assertSame(1, $c['dontKnow']);
        $this->assertSame(1, $c['skip']);
    }

    public function test_checkpoint_buckets(): void
    {
        $u = User::factory()->create();
        $cp = ['mode' => 'checkpoint'];
        $this->event($u, $cp + ['exercise' => 'x1']); // first exposure
        $this->event($u, $cp + ['exercise' => 'x1']); // previously exposed
        $this->event($u, $cp + ['exercise' => 'x2', 'normal' => 2]); // replay
        $this->event($u, $cp + ['exercise' => 'x3', 'text' => true]); // text
        $this->event($u, ['kind' => 'checkpoint_exposure', 'mode' => 'checkpoint', 'exercise' => 'x4', 'correctness' => null]);
        $this->event($u, $cp + ['exercise' => 'x4', 'correctness' => 'incorrect']); // previously exposed
        $this->event($u, ['mode' => 'lesson', 'exercise' => 'x5']);
        $this->event($u, $cp + ['exercise' => 'x5']); // previously exposed via a lesson response

        $k = $this->report()['total']['checkpoint'];
        $this->assertSame(1, $k['firstExposure']['n']);
        $this->assertSame(1, $k['replayAssisted']['n']);
        $this->assertSame(1, $k['textAssisted']['n']);
        $this->assertSame(['n' => 3, 'correct' => 2, 'rate' => 0.6667], $k['previouslyExposed']);
    }

    public function test_checkpoint_exposure_logged_on_show_does_not_make_the_same_showing_previously_exposed(): void
    {
        // Real client order (ListeningCheckScreen): checkpoint_exposure is appended when the item mounts,
        // then the answer arrives under the same opportunity id.
        $u = User::factory()->create();
        $exposure = ['kind' => 'checkpoint_exposure', 'mode' => 'checkpoint', 'correctness' => null];
        $cp = ['mode' => 'checkpoint'];
        $this->event($u, $exposure + ['exercise' => 'x1', 'opportunity' => 'show-1']);
        $this->event($u, $cp + ['exercise' => 'x1', 'opportunity' => 'show-1']); // first exposure
        $this->event($u, $cp + ['exercise' => 'x1', 'opportunity' => 'show-1', 'correctness' => 'incorrect']); // retry in same showing: not re-bucketed
        $this->event($u, $exposure + ['exercise' => 'x1', 'opportunity' => 'show-2']);
        $this->event($u, $cp + ['exercise' => 'x1', 'opportunity' => 'show-2']); // shown again later: previously exposed

        $k = $this->report()['total']['checkpoint'];
        $this->assertSame(['n' => 1, 'correct' => 1, 'rate' => 1], $k['firstExposure']);
        $this->assertSame(['n' => 1, 'correct' => 1, 'rate' => 1], $k['previouslyExposed']);
        $this->assertSame(0, $k['replayAssisted']['n'] + $k['textAssisted']['n']);
    }

    public function test_delayed_recall_boundaries(): void
    {
        $u = User::factory()->create();
        $t = Carbon::parse(self::T0);
        // under one day: no bucket
        $this->event($u, ['target' => 'a', 'at' => $t]);
        $this->event($u, ['target' => 'a', 'at' => $t->copy()->addHours(23)->addMinutes(59)]);
        // exactly one day: 1-7 bucket (correct)
        $this->event($u, ['target' => 'b', 'at' => $t]);
        $this->event($u, ['target' => 'b', 'at' => $t->copy()->addDay()]);
        // just under seven days: 1-7 bucket (incorrect)
        $this->event($u, ['target' => 'c', 'at' => $t]);
        $this->event($u, ['target' => 'c', 'at' => $t->copy()->addDays(7)->subSecond(), 'correctness' => 'incorrect']);
        // exactly seven days: 7+ bucket
        $this->event($u, ['target' => 'd', 'at' => $t]);
        $this->event($u, ['target' => 'd', 'at' => $t->copy()->addDays(7)]);
        // assisted late attempt: excluded
        $this->event($u, ['target' => 'e', 'at' => $t]);
        $this->event($u, ['target' => 'e', 'at' => $t->copy()->addDays(9), 'text' => true]);

        $r = $this->report()['total']['delayedRecall'];
        $this->assertSame(['n' => 2, 'correct' => 1, 'rate' => 0.5], $r['oneToSevenDays']);
        $this->assertSame(['n' => 1, 'correct' => 1, 'rate' => 1], $r['sevenDaysPlus']);
    }

    public function test_client_time_basis_changes_recall_gap_and_is_labelled(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['target' => 'a', 'at' => self::T0]);
        $this->event($u, ['target' => 'a', 'at' => '2026-10-01 12:05:00', 'client' => '2026-10-03 12:00:00']);

        $this->assertSame(0, $this->report()['total']['delayedRecall']['oneToSevenDays']['n']);
        $client = $this->report(['--time-basis' => 'client']);
        $this->assertSame(1, $client['total']['delayedRecall']['oneToSevenDays']['n']);
        $this->assertSame('client-reported, untrusted', $client['timeBasisLabel']);
        $this->artisan('mandarin:report:baseline --time-basis=client')->expectsOutputToContain('client-reported, untrusted')->assertSuccessful();
        $this->artisan('mandarin:report:baseline')->expectsOutputToContain('accepted_at includes sync delay')->assertSuccessful();
        $this->artisan('mandarin:report:baseline --time-basis=nope')->assertFailed();
    }

    public function test_preview_excluded_and_activity_help_lapses(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['mode' => 'preview', 'session' => 'only-preview']);
        $this->event($u, ['target' => 'a', 'grade' => 'Good', 'at' => '2026-10-01 10:00:00', 'session' => 's1']);
        $this->event($u, ['kind' => 'help_revealed', 'correctness' => null, 'at' => '2026-10-01 10:01:00', 'session' => 's1']);
        $this->event($u, ['target' => 'a', 'grade' => 'Again', 'text' => true, 'at' => '2026-10-03 10:00:00', 'session' => 's2']);
        $this->event($u, ['target' => 'b', 'grade' => 'Again', 'at' => '2026-10-03 10:05:00', 'session' => 's2']);

        $d = $this->report()['total'];
        $this->assertSame(2, $d['activity']['sessions']);
        $this->assertSame(2, $d['activity']['activeDays']);
        $this->assertSame('2026-10-01', $d['activity']['firstActivity']);
        $this->assertSame('2026-10-03', $d['activity']['lastActivity']);
        $this->assertSame(3, $d['activity']['responseEvents']);
        $this->assertSame(33.33, $d['helpDependence']['helpRevealedPer100Responses']);
        $this->assertSame(0.3333, $d['helpDependence']['textOrPinyinShare']);
        // Target a's Again is a correct answer with text help, not forgetting.
        $this->assertSame(0, $d['lapses']['targetsIncorrectAfterGood']);
    }

    public function test_lapse_is_an_incorrect_answer_after_good_not_a_help_assisted_again(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['target' => 'a', 'grade' => 'Good']);
        $this->event($u, ['target' => 'a', 'grade' => 'Again', 'text' => true]); // correct with help: server grades Again
        $this->event($u, ['target' => 'b', 'grade' => 'Good']);
        $this->event($u, ['target' => 'b', 'grade' => 'Again', 'correctness' => 'incorrect']); // forgot: lapse
        $this->event($u, ['target' => 'b', 'grade' => 'Again', 'correctness' => 'incorrect']); // same target counted once
        $this->event($u, ['target' => 'c', 'grade' => 'Again', 'correctness' => 'incorrect']); // never Good: not a lapse

        $this->assertSame(1, $this->report()['total']['lapses']['targetsIncorrectAfterGood']);
    }

    public function test_since_until_and_course_filters(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['target' => 'a', 'at' => '2026-09-01 10:00:00']);
        $this->event($u, ['target' => 'a', 'at' => '2026-10-05 10:00:00']);
        $this->event($u, ['target' => 'z', 'at' => '2026-10-20 10:00:00']);
        $this->event($u, ['target' => 'q', 'course' => 'other-course']);

        $d = $this->report(['--since' => '2026-10-01', '--until' => '2026-10-10']);
        $this->assertSame(1, $d['total']['activity']['responseEvents']);
        // history before --since still provides the delayed-recall predecessor
        $this->assertSame(1, $d['total']['delayedRecall']['sevenDaysPlus']['n']);
        $this->assertSame(1, $this->report(['--course' => 'other-course'])['total']['activity']['responseEvents']);
        $this->artisan('mandarin:report:baseline --since=banana')->assertFailed();
    }

    public function test_json_shape_and_learner_order(): void
    {
        $late = User::factory()->create();
        $early = User::factory()->create();
        $this->event($late, ['at' => '2026-10-02 10:00:00']);
        $this->event($early, ['at' => '2026-10-01 10:00:00']);

        $d = $this->report();
        $this->assertSame(['courseId', 'timeBasis', 'timeBasisLabel', 'since', 'until', 'notes', 'learnerCount', 'learners', 'total'], array_keys($d));
        $this->assertSame(2, $d['learnerCount']);
        $this->assertSame(['Learner 1', 'Learner 2'], array_column($d['learners'], 'label'));
        $this->assertSame('2026-10-01', $d['learners'][0]['activity']['firstActivity']);
        $this->assertSame(['label', 'activity', 'comprehension', 'checkpoint', 'delayedRecall', 'spokenRecall', 'helpDependence', 'lapses', 'scheduler'], array_keys($d['total']));
    }

    public function test_no_identifiers_in_either_format(): void
    {
        $u = User::factory()->create(['name' => 'Zebediah Quux', 'email' => 'zeb.quux@example.test']);
        $this->event($u);
        $this->event($u, ['kind' => 'help_revealed', 'correctness' => null]);

        Artisan::call('mandarin:report:baseline', ['--json' => true]);
        $json = Artisan::output();
        Artisan::call('mandarin:report:baseline');
        $text = Artisan::output();

        foreach ([$json, $text] as $out) {
            $this->assertStringContainsString('Learner 1', $out);
            foreach (['secret-session-a', 'secret-evt', 'zeb.quux', 'Zebediah', 'example.test'] as $needle) {
                $this->assertStringNotContainsString($needle, $out);
            }
            $this->assertDoesNotMatchRegularExpression('/"(user_?id|email|sessionId|clientEventId)"/i', $out);
        }
    }

    public function test_scheduler_transitions_keep_skills_separate_and_use_history_before_the_window(): void
    {
        $u = User::factory()->create();
        $eligible = ['eligible' => true];
        $this->event($u, $eligible + ['target' => 'a', 'grade' => 'Good', 'at' => '2026-09-30 12:00:00']);
        $this->event($u, $eligible + ['target' => null, 'card' => 'utterance:a#form.recall', 'grade' => 'Hard', 'rating' => 'partly', 'at' => '2026-10-01 12:00:00']);
        $this->event($u, $eligible + ['target' => 'a', 'grade' => 'Again', 'text' => true, 'at' => '2026-10-07 12:00:00']);
        $this->event($u, $eligible + ['target' => null, 'card' => 'utterance:a#form.recall', 'grade' => 'Good', 'rating' => 'said_it', 'at' => '2026-10-08 12:00:00']);

        $s = $this->report(['--since' => '2026-10-01'])['total']['scheduler'];
        $this->assertSame(0, $s['eligibleGrades']['listen.meaning']['Good']);
        $this->assertSame(1, $s['againReasons']['listen.meaning']['correctWithHelp']);
        $this->assertSame([
            ['skill' => 'form.recall', 'fromGrade' => 'Hard', 'gap' => 'sevenDaysPlus', 'nextEvidence' => 'selfReport', 'n' => 1, 'nextGood' => 1, 'nextAgain' => 0, 'nextGoodRate' => 1, 'nextAgainRate' => 0],
            ['skill' => 'listen.meaning', 'fromGrade' => 'Good', 'gap' => 'sevenDaysPlus', 'nextEvidence' => 'textOrPinyin', 'n' => 1, 'nextGood' => 0, 'nextAgain' => 1, 'nextGoodRate' => 0, 'nextAgainRate' => 1],
        ], $s['nextEligible']);
    }

    public function test_scheduler_counts_only_first_eligible_responses_and_separates_again_reasons(): void
    {
        $u = User::factory()->create();
        $eligible = ['eligible' => true];
        $this->event($u, $eligible + ['grade' => 'Again', 'correctness' => 'incorrect', 'opportunity' => 'same']);
        $this->event($u, $eligible + ['grade' => 'Good', 'opportunity' => 'same']); // legacy retry
        $this->event($u, $eligible + ['grade' => 'Good', 'attempt' => 1, 'schema' => 2]); // explicit retry
        $this->event($u, $eligible + ['grade' => 'Again', 'text' => true]);
        $this->event($u, $eligible + ['grade' => 'Again']); // neither incorrect nor helped correct
        $this->event($u, ['grade' => 'Good']); // window-blocked
        $this->event($u, $eligible + ['grade' => 'Good', 'mode' => 'extra_practice']);
        $this->event($u, $eligible + ['grade' => 'Good', 'kind' => 'help_revealed']);
        $this->event($u, $eligible + ['grade' => 'Good', 'mode' => 'checkpoint']);
        $this->event($u, $eligible + ['grade' => 'Good', 'mode' => 'preview']);
        $this->event($u, $eligible + ['grade' => 'Again', 'target' => null, 'card' => 'utterance:a#form.recall', 'rating' => 'missed', 'correctness' => 'incorrect']);
        $this->event($u, $eligible + ['grade' => 'Again', 'target' => null, 'card' => 'utterance:a#form.recall', 'action' => 'dont_know', 'correctness' => 'incorrect']);

        $s = $this->report()['total']['scheduler'];
        $this->assertSame(['Again' => 3, 'Hard' => 0, 'Good' => 0, 'Easy' => 0], $s['eligibleGrades']['listen.meaning']);
        $this->assertSame(['incorrect' => 1, 'correctWithHelp' => 1, 'other' => 1], $s['againReasons']['listen.meaning']);
        $this->assertSame(['selfReportedMiss' => 1, 'didNotTry' => 1, 'other' => 0], $s['againReasons']['form.recall']);
    }

    public function test_stuck_cards_use_lifetime_eligible_history_and_do_not_merge_learners_or_skills(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        foreach (range(1, 4) as $i) {
            foreach ([$a, $b] as $user) {
                $this->event($user, ['eligible' => true, 'target' => 'same', 'grade' => 'Hard', 'at' => "2026-09-{$i} 12:00:00"]);
            }
            $this->event($a, ['eligible' => true, 'target' => null, 'card' => 'utterance:same#form.recall', 'grade' => 'Again', 'at' => "2026-09-{$i} 12:00:00"]);
            $this->event($a, ['target' => 'blocked', 'grade' => 'Again']);
        }
        $this->event($a, ['eligible' => true, 'target' => 'same', 'grade' => 'Hard']);
        $this->event($a, ['eligible' => true, 'target' => null, 'card' => 'utterance:same#form.recall', 'grade' => 'Again']);
        $this->event($b, ['eligible' => true, 'target' => 'same', 'grade' => 'Good']); // recovered
        $s = $this->report(['--since' => '2026-10-01'])['total']['scheduler'];
        $this->assertSame(['listen.meaning' => 1, 'form.recall' => 1], $s['neverGoodCards']);
        $this->assertSame(['listen.meaning' => 0, 'form.recall' => 0], $this->report(['--since' => '2026-10-02'])['total']['scheduler']['neverGoodCards']);
    }

    public function test_sync_lag_and_event_schema_arrivals_have_explicit_boundaries(): void
    {
        $u = User::factory()->create();
        $at = Carbon::parse(self::T0);
        foreach ([59, 60, 3599, 3600, 86399, 86400] as $seconds) {
            $this->event($u, ['schema' => 2, 'client' => $at->copy()->subSeconds($seconds)]);
        }
        $this->event($u, ['client' => null]);
        $this->event($u, ['kind' => 'help_revealed', 'schema' => 3, 'client' => $at->copy()->addSecond()]);
        $this->event($u, ['mode' => 'preview', 'schema' => 2]);
        $s = $this->report()['total']['scheduler'];
        $this->assertSame(['v1' => 1, 'v2' => 6, 'other' => 1], $s['eventSchemas']);
        $this->assertSame(['unparsed' => 1, 'futureClock' => 1, 'underOneMinute' => 1, 'oneMinuteToHour' => 2, 'oneHourToDay' => 2, 'oneDayPlus' => 1], $s['syncLag']);
    }

    public function test_next_eligible_gap_boundaries_and_client_clock_reversal(): void
    {
        $u = User::factory()->create();
        $at = Carbon::parse(self::T0);
        foreach ([86399, 86400, 604799, 604800] as $gap) {
            $this->event($u, ['eligible' => true, 'target' => 't'.$gap, 'grade' => 'Good', 'at' => $at]);
            $this->event($u, ['eligible' => true, 'target' => 't'.$gap, 'grade' => 'Hard', 'normal' => 2, 'at' => $at->copy()->addSeconds($gap)]);
        }
        $rows = $this->report()['total']['scheduler']['nextEligible'];
        $this->assertSame(['oneToSevenDays' => 2, 'sevenDaysPlus' => 1, 'underOneDay' => 1], array_column($rows, 'n', 'gap'));
        $this->assertSame(['replayOrSlow'], array_values(array_unique(array_column($rows, 'nextEvidence'))));

        $this->event($u, ['eligible' => true, 'target' => 'clock', 'grade' => 'Good', 'client' => $at]);
        $this->event($u, ['eligible' => true, 'target' => 'clock', 'grade' => 'Again', 'correctness' => 'incorrect', 'client' => $at->copy()->subDay()]);
        $rows = $this->report(['--time-basis' => 'client'])['total']['scheduler']['nextEligible'];
        $this->assertContains('clockWentBack', array_column($rows, 'gap'));
    }

    public function test_scheduler_output_remains_anonymous_and_visible_in_text(): void
    {
        $u = User::factory()->create();
        $this->event($u, ['eligible' => true, 'target' => 'secret-target', 'card' => 'target:secret-target#listen.meaning', 'grade' => 'Good']);
        $this->event($u, ['eligible' => true, 'target' => 'secret-target', 'card' => 'target:secret-target#listen.meaning', 'grade' => 'Again', 'correctness' => 'incorrect', 'at' => '2026-10-03 12:00:00']);
        $data = $this->report();
        $this->assertStringNotContainsString('secret-target', json_encode($data, JSON_THROW_ON_ERROR));
        $this->artisan('mandarin:report:baseline')->expectsOutputToContain('Scheduler diagnostics (first responses, server eligibility; self-report kept separate):')->expectsOutputToContain('Sync lag')->assertSuccessful();
    }

    public function test_command_performs_no_writes(): void
    {
        $u = User::factory()->create();
        $this->event($u);
        $counts = fn (): array => [MandarinPracticeEvent::query()->count(), User::query()->count(), DB::table('migrations')->count()];
        $before = $counts();
        $checksum = MandarinPracticeEvent::query()->orderBy('id')->get()->toJson();

        $this->artisan('mandarin:report:baseline')->assertSuccessful();
        $this->artisan('mandarin:report:baseline --json --time-basis=client')->assertSuccessful();

        $this->assertSame($before, $counts());
        $this->assertSame($checksum, MandarinPracticeEvent::query()->orderBy('id')->get()->toJson());
    }
}
