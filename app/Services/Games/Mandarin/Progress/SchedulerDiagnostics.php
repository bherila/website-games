<?php

namespace App\Services\Games\Mandarin\Progress;

/** Read-only counts for the scheduler audit: never exports card or learner identifiers. */
class SchedulerDiagnostics
{
    private const DAY = 86400;

    private const SKILLS = ['listen.meaning', 'form.recall'];

    /**
     * Events include history before the report window, in server sequence order per learner.
     * Only the later event of a transition has to be in the window. Self-rated formulation
     * evidence is kept separate from listening; grades are not pronunciation assessments.
     *
     * @param  list<list<array<string, mixed>>>  $users
     * @return array<string, mixed>
     */
    public function build(array $users): array
    {
        $grades = array_fill_keys(self::SKILLS, ['Again' => 0, 'Hard' => 0, 'Good' => 0, 'Easy' => 0]);
        $again = [
            'listen.meaning' => ['incorrect' => 0, 'correctWithHelp' => 0, 'other' => 0],
            'form.recall' => ['selfReportedMiss' => 0, 'didNotTry' => 0, 'other' => 0],
        ];
        $neverGood = array_fill_keys(self::SKILLS, 0);
        $schemas = ['v1' => 0, 'v2' => 0, 'other' => 0];
        $lag = ['unparsed' => 0, 'futureClock' => 0, 'underOneMinute' => 0, 'oneMinuteToHour' => 0, 'oneHourToDay' => 0, 'oneDayPlus' => 0];
        $transitions = [];

        foreach ($users as $events) {
            $seen = [];
            $cards = [];
            foreach ($events as $e) {
                if ($e['in']) {
                    $schemas[match ($e['schema']) {
                        1 => 'v1', 2 => 'v2', default => 'other'
                    }]++;
                    $lag[$this->lagBucket($e)]++;
                }
                if ($e['kind'] !== 'response') {
                    continue;
                }
                // v1 lacks attemptIndex. Dedupe its first response too, even if that
                // response was unscored: seeing feedback is not fresh retrieval.
                $opportunity = $e['opportunity'];
                if (is_string($opportunity)) {
                    if (isset($seen[$opportunity])) {
                        continue;
                    }
                    $seen[$opportunity] = true;
                }
                $card = $e['card'];
                $grade = $e['grade'];
                if (! $e['eligible'] || $e['attemptIndex'] !== 0
                    || ! in_array($e['mode'], ['lesson', 'review'], true)
                    || ! is_string($card) || ! is_string($grade)) {
                    continue;
                }
                $skill = str_ends_with($card, '#listen.meaning') ? 'listen.meaning'
                    : (str_ends_with($card, '#form.recall') ? 'form.recall' : null);
                if ($skill === null || ! array_key_exists($grade, $grades[$skill])) {
                    continue;
                }
                $previous = $cards[$card] ?? null;
                if ($e['in']) {
                    $grades[$skill][$grade]++;
                    if ($grade === 'Again') {
                        $again[$skill][$this->againReason($e, $skill)]++;
                    }
                    if ($previous !== null) {
                        $gap = $e['ts'] - $previous['ts'];
                        $bucket = $gap < 0 ? 'clockWentBack' : ($gap < self::DAY ? 'underOneDay'
                            : ($gap < 7 * self::DAY ? 'oneToSevenDays' : 'sevenDaysPlus'));
                        $evidence = $skill === 'form.recall' ? 'selfReport' : ($e['text'] ? 'textOrPinyin'
                            : ($e['normal'] > 1 || $e['slow'] > 0 ? 'replayOrSlow' : 'unaided'));
                        $key = $skill.'|'.$previous['grade'].'|'.$bucket.'|'.$evidence;
                        $transitions[$key] ??= [
                            'skill' => $skill, 'fromGrade' => $previous['grade'], 'gap' => $bucket,
                            'nextEvidence' => $evidence, 'n' => 0, 'nextGood' => 0, 'nextAgain' => 0,
                        ];
                        $transitions[$key]['n']++;
                        $transitions[$key]['nextGood'] += $grade === 'Good' ? 1 : 0;
                        $transitions[$key]['nextAgain'] += $grade === 'Again' ? 1 : 0;
                    }
                }
                $cards[$card] = [
                    'skill' => $skill, 'grade' => $grade, 'ts' => $e['ts'],
                    'count' => ($previous['count'] ?? 0) + 1,
                    'hadGood' => ($previous['hadGood'] ?? false) || $grade === 'Good' || $grade === 'Easy',
                    'in' => ($previous['in'] ?? false) || $e['in'],
                ];
            }
            foreach ($cards as $card) {
                if ($card['in'] && $card['count'] >= 4 && ! $card['hadGood']) {
                    $neverGood[$card['skill']]++;
                }
            }
        }
        ksort($transitions);
        $rows = [];
        foreach ($transitions as $row) {
            $rows[] = $row + [
                'nextGoodRate' => round($row['nextGood'] / $row['n'], 4),
                'nextAgainRate' => round($row['nextAgain'] / $row['n'], 4),
            ];
        }

        return [
            'eligibleGrades' => $grades,
            'againReasons' => $again,
            'nextEligible' => $rows,
            'neverGoodCards' => $neverGood,
            'eventSchemas' => $schemas,
            'syncLag' => $lag,
        ];
    }

    /** @param array<string, mixed> $e */
    private function againReason(array $e, string $skill): string
    {
        if ($skill === 'form.recall') {
            return $e['action'] === 'dont_know' ? 'didNotTry' : ($e['selfRating'] === 'missed' ? 'selfReportedMiss' : 'other');
        }

        return $e['correctness'] === 'incorrect' ? 'incorrect'
            : ($e['correctness'] === 'correct' && $e['text'] ? 'correctWithHelp' : 'other');
    }

    /** @param array<string, mixed> $e */
    private function lagBucket(array $e): string
    {
        if ($e['clientTs'] === null) {
            return 'unparsed';
        }
        $seconds = $e['acceptedTs'] - $e['clientTs'];

        return match (true) {
            $seconds < 0 => 'futureClock',
            $seconds < 60 => 'underOneMinute',
            $seconds < 3600 => 'oneMinuteToHour',
            $seconds < self::DAY => 'oneHourToDay',
            default => 'oneDayPlus',
        };
    }
}
