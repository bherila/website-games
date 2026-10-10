<?php

namespace App\Services\Games\Mandarin\Progress;

use App\Models\Mandarin\MandarinPracticeEvent;
use Illuminate\Support\Carbon;

/**
 * Read-only, anonymised baseline of the practice log (issue #103). Never writes,
 * and the returned structure carries no user, event or session identifier:
 * learners are "Learner 1..N" in order of first activity.
 *
 * History (earlier exposures, previous scored response, earlier Good) is read
 * from the whole log up to `until`; `since` only limits which events are counted.
 */
class BaselineReport
{
    public const BASIS_ACCEPTED = 'accepted';

    public const BASIS_CLIENT = 'client';

    private const DAY = 86400;

    /** Practice modes that feed the comprehension measure. */
    private const COMPREHENSION_MODES = ['lesson', 'review'];

    /** Excluded from every measure: previews are not learner practice. */
    private const EXCLUDED_MODE = 'preview';

    /**
     * @return array<string, mixed>
     */
    public function build(string $courseId, ?Carbon $since = null, ?Carbon $until = null, string $timeBasis = self::BASIS_ACCEPTED): array
    {
        $client = $timeBasis === self::BASIS_CLIENT;
        $sinceTs = $since?->copy()->startOfDay()->getTimestamp();
        $untilTs = $until?->copy()->endOfDay()->getTimestamp();

        /** @var array<int, list<array<string, mixed>>> $byUser */
        $byUser = [];
        $query = MandarinPracticeEvent::query()
            ->where('course_id', $courseId)
            ->where('mode', '!=', self::EXCLUDED_MODE)
            ->orderBy('user_id')->orderBy('sequence')
            ->select(['user_id', 'sequence', 'kind', 'mode', 'opportunity_id', 'exercise_id', 'target_id', 'correctness', 'grade', 'payload', 'client_occurred_at', 'accepted_at']);
        foreach ($query->cursor() as $row) {
            $time = ($client ? $row->client_occurred_at : null) ?? $row->accepted_at;
            $ts = $time->getTimestamp();
            if ($untilTs !== null && $ts > $untilTs) {
                continue;
            }
            /** @var mixed $payload */
            $payload = json_decode($row->payload, true);
            $payload = is_array($payload) ? $payload : [];
            $evidence = is_array($payload['audioEvidence'] ?? null) ? $payload['audioEvidence'] : [];
            $byUser[$row->user_id][] = [
                'kind' => $row->kind,
                'mode' => $row->mode,
                'opportunity' => $row->opportunity_id,
                'exercise' => $row->exercise_id,
                'target' => $row->target_id,
                'correctness' => $row->correctness,
                'grade' => $row->grade,
                'ts' => $ts,
                'day' => $time->format('Y-m-d'),
                'in' => $sinceTs === null || $ts >= $sinceTs,
                'session' => is_string($payload['sessionId'] ?? null) ? $payload['sessionId'] : null,
                'action' => is_string($payload['responseAction'] ?? null) ? $payload['responseAction'] : null,
                'text' => ($payload['textHelpUsed'] ?? false) === true || ($payload['pinyinHelpUsed'] ?? false) === true,
                'normal' => (int) ($evidence['normalPlayCount'] ?? 0),
                'slow' => (int) ($evidence['slowPlayCount'] ?? 0),
            ];
        }

        $groups = [];
        foreach ($byUser as $userId => $events) {
            $first = null;
            foreach ($events as $event) {
                if ($event['in']) {
                    $first = $event['ts'];
                    break;
                }
            }
            if ($first !== null) {
                $groups[] = ['first' => $first, 'user' => $userId, 'events' => $events];
            }
        }
        usort($groups, fn (array $a, array $b): int => [$a['first'], $a['user']] <=> [$b['first'], $b['user']]);

        $learners = [];
        foreach ($groups as $i => $group) {
            $learners[] = ['label' => 'Learner '.($i + 1)] + $this->metrics([$group['events']]);
        }

        return [
            'courseId' => $courseId,
            'timeBasis' => $timeBasis,
            'timeBasisLabel' => $client ? 'client-reported, untrusted' : 'server-accepted',
            'since' => $since?->toDateString(),
            'until' => $until?->toDateString(),
            'notes' => $client
                ? ['Times are client-reported (clientOccurredAt) and untrusted; they fall back to accepted_at when absent.']
                : ['accepted_at includes sync delay for offline sessions: a session played offline is stamped when it uploads, not when it was played.'],
            'learnerCount' => count($learners),
            'learners' => $learners,
            'total' => ['label' => 'All learners'] + $this->metrics(array_column($groups, 'events')),
        ];
    }

    /**
     * @param  list<list<array<string, mixed>>>  $users  one event list per learner, canonical order
     * @return array<string, mixed>
     */
    private function metrics(array $users): array
    {
        $sessions = [];
        $days = [];
        $responses = 0;
        $comp = ['unaided' => [0, 0], 'replayAssisted' => [0, 0], 'textAssisted' => [0, 0]];
        $dontKnow = 0;
        $skip = 0;
        $checkpoint = ['firstExposure' => [0, 0], 'replayAssisted' => [0, 0], 'textAssisted' => [0, 0], 'previouslyExposed' => [0, 0]];
        $recall = ['oneToSevenDays' => [0, 0], 'sevenDaysPlus' => [0, 0]];
        $helpRevealed = 0;
        $helped = 0;
        $lapsed = 0;

        foreach ($users as $u => $events) {
            /** @var array<string, array<string, true>> $seenExercises exercise => opportunities it was shown or answered in */
            $seenExercises = [];
            /** @var array<string, true> $classified checkpoint opportunities whose first answer is already bucketed */
            $classified = [];
            /** @var array<string, int> $prevScored target => ts of previous scored response */
            $prevScored = [];
            /** @var array<string, bool> $good */
            $good = [];
            /** @var array<string, bool> $lapseCounted */
            $lapseCounted = [];

            foreach ($events as $e) {
                $counted = $e['in'];
                $isResponse = $e['kind'] === 'response';
                $scored = $isResponse && in_array($e['correctness'], ['correct', 'incorrect'], true);
                $correct = $e['correctness'] === 'correct';
                $replay = ! $e['text'] && ($e['normal'] > 1 || $e['slow'] > 0);
                $unaided = ! $e['text'] && $e['normal'] <= 1 && $e['slow'] === 0;

                if ($counted) {
                    if (is_string($e['session'])) {
                        $sessions[$u.'|'.$e['session']] = true;
                    }
                    $days[$e['day']] = true;
                    if ($isResponse) {
                        $responses++;
                        $helped += $e['text'] ? 1 : 0;
                    }
                    if ($e['kind'] === 'help_revealed') {
                        $helpRevealed++;
                    }
                }

                if ($isResponse && $counted && in_array($e['mode'], self::COMPREHENSION_MODES, true)) {
                    if ($e['action'] === 'dont_know') {
                        $dontKnow++;
                    } elseif ($e['action'] === 'skip') {
                        $skip++;
                    }
                    if ($scored) {
                        $bucket = $e['text'] ? 'textAssisted' : ($replay ? 'replayAssisted' : 'unaided');
                        $comp[$bucket][0]++;
                        $comp[$bucket][1] += $correct ? 1 : 0;
                    }
                }

                // The client records checkpoint_exposure when an item is shown, before the answer, under the
                // same opportunity. Only events from an earlier opportunity are prior exposure, and only the
                // first answer within an opportunity is classified.
                $opportunity = (string) ($e['opportunity'] ?? '');
                if ($isResponse && $counted && $e['mode'] === 'checkpoint' && $scored && is_string($e['exercise'])
                    && ! isset($classified[$e['exercise'].'|'.$opportunity])) {
                    $classified[$e['exercise'].'|'.$opportunity] = true;
                    $earlier = array_diff_key($seenExercises[$e['exercise']] ?? [], [$opportunity => true]);
                    $bucket = $earlier !== [] ? 'previouslyExposed'
                        : ($e['text'] ? 'textAssisted' : ($replay ? 'replayAssisted' : 'firstExposure'));
                    $checkpoint[$bucket][0]++;
                    $checkpoint[$bucket][1] += $correct ? 1 : 0;
                }
                if (($isResponse || $e['kind'] === 'checkpoint_exposure') && is_string($e['exercise'])) {
                    $seenExercises[$e['exercise']][$opportunity] = true;
                }

                if ($scored && is_string($e['target'])) {
                    $target = $e['target'];
                    if (isset($prevScored[$target]) && $counted) {
                        $gap = $e['ts'] - $prevScored[$target];
                        $bucket = $gap >= 7 * self::DAY ? 'sevenDaysPlus' : ($gap >= self::DAY ? 'oneToSevenDays' : null);
                        // Assisted attempts are not recall evidence; only unaided ones enter the rate.
                        if ($bucket !== null && $unaided) {
                            $recall[$bucket][0]++;
                            $recall[$bucket][1] += $correct ? 1 : 0;
                        }
                    }
                    $prevScored[$target] = $e['ts'];
                }

                if ($isResponse && is_string($e['target'])) {
                    $key = $e['target'];
                    if ($e['grade'] === 'Good') {
                        $good[$key] = true;
                    } elseif ($e['grade'] === 'Again' && isset($good[$key]) && $counted && ! isset($lapseCounted[$key])) {
                        $lapseCounted[$key] = true;
                        $lapsed++;
                    }
                }
            }
        }

        $dayList = array_keys($days);
        sort($dayList);
        $rate = fn (array $pair): array => ['n' => $pair[0], 'correct' => $pair[1], 'rate' => $pair[0] > 0 ? round($pair[1] / $pair[0], 4) : null];
        $per100 = fn (int $n): ?float => $responses > 0 ? round($n * 100 / $responses, 2) : null;

        return [
            'activity' => [
                'sessions' => count($sessions),
                'activeDays' => count($days),
                'firstActivity' => $dayList[0] ?? null,
                'lastActivity' => $dayList === [] ? null : $dayList[count($dayList) - 1],
                'responseEvents' => $responses,
            ],
            'comprehension' => [
                'unaided' => $rate($comp['unaided']),
                'replayAssisted' => $rate($comp['replayAssisted']),
                'textAssisted' => $rate($comp['textAssisted']),
                'dontKnow' => $dontKnow,
                'skip' => $skip,
            ],
            'checkpoint' => array_map($rate, $checkpoint),
            'delayedRecall' => array_map($rate, $recall),
            'helpDependence' => [
                'helpRevealedPer100Responses' => $per100($helpRevealed),
                'textOrPinyinShare' => $responses > 0 ? round($helped / $responses, 4) : null,
            ],
            'lapses' => ['targetsAgainAfterGood' => $lapsed],
        ];
    }
}
