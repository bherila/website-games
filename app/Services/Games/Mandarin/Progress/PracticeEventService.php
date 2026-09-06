<?php

namespace App\Services\Games\Mandarin\Progress;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Course\CourseValidator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Append-only practice log with server-side grading. The client never sends
 * a correct flag, a grade, or a schedule; it sends what it showed and what
 * the learner did. Identical re-uploads are acknowledged as already_present;
 * a reused id with a different payload is a conflict.
 */
class PracticeEventService
{
    private const KINDS = ['response', 'teaching_exposure', 'help_revealed', 'node_complete', 'scene_complete', 'checkpoint_exposure'];

    private const MODES = ['lesson', 'review', 'extra_practice', 'checkpoint', 'preview'];

    public function __construct(private readonly CourseRepository $courses) {}

    /**
     * @param  list<array<string, mixed>>  $events
     * @return array{acknowledgments: list<array<string, mixed>>, lastSequence: int}
     */
    public function append(User $user, array $events): array
    {
        $acknowledgments = [];
        foreach ($events as $event) {
            $acknowledgments[] = $this->appendOne($user, $event);
        }

        return ['acknowledgments' => $acknowledgments, 'lastSequence' => $this->lastSequence($user)];
    }

    public function lastSequence(User $user): int
    {
        return (int) MandarinPracticeEvent::query()->where('user_id', $user->id)->max('sequence');
    }

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private function appendOne(User $user, array $event): array
    {
        $clientEventId = is_string($event['clientEventId'] ?? null) ? $event['clientEventId'] : null;
        if ($clientEventId === null || $clientEventId === '' || strlen($clientEventId) > 64) {
            return $this->reject((string) ($clientEventId ?? ''), 'invalid_event_id');
        }
        $course = is_string($event['courseId'] ?? null) && is_string($event['contentVersion'] ?? null)
            ? $this->courses->revision($event['courseId'], $event['contentVersion'])
            : null;
        if ($course === null) {
            return $this->reject($clientEventId, 'unknown_course_revision');
        }
        $problem = $this->validate($course, $event);
        if ($problem !== null) {
            return $this->reject($clientEventId, $problem);
        }
        $payloadHash = hash('sha256', CourseValidator::canonicalJson($event));

        $existing = MandarinPracticeEvent::query()->where('user_id', $user->id)->where('client_event_id', $clientEventId)->first();
        if ($existing !== null) {
            return $existing->payload_hash === $payloadHash
                ? $this->accept($existing, 'already_present')
                : $this->reject($clientEventId, 'conflict');
        }

        [$correctness, $grade, $targetId] = $this->grade($course, $event);
        $eligible = $grade !== null && $targetId !== null && in_array($event['mode'], ['lesson', 'review'], true);

        for ($attempt = 0; $attempt < 3; $attempt++) {
            try {
                $row = DB::transaction(function () use ($user, $event, $clientEventId, $payloadHash, $correctness, $grade, $targetId, $eligible): MandarinPracticeEvent {
                    $sequence = $this->lastSequence($user) + 1;
                    $scheduleEligible = $eligible && ! $this->windowTaken($user, (string) $targetId);

                    return MandarinPracticeEvent::query()->create([
                        'user_id' => $user->id,
                        'client_event_id' => $clientEventId,
                        'sequence' => $sequence,
                        'course_id' => $event['courseId'],
                        'content_version' => $event['contentVersion'],
                        'kind' => $event['kind'],
                        'mode' => $event['mode'],
                        'opportunity_id' => $event['opportunityId'] ?? null,
                        'scene_id' => $event['sceneId'] ?? null,
                        'node_id' => $event['nodeId'] ?? null,
                        'exercise_id' => $event['exerciseId'] ?? null,
                        'target_id' => $targetId,
                        'correctness' => $correctness,
                        'grade' => $grade,
                        'schedule_eligible' => $scheduleEligible,
                        'payload_hash' => $payloadHash,
                        'payload' => CourseValidator::canonicalJson($event),
                        'client_occurred_at' => $this->parseTime($event['clientOccurredAt'] ?? null),
                        'accepted_at' => now(),
                    ]);
                });

                return $this->accept($row, 'accepted');
            } catch (QueryException $exception) {
                // Unique (user, client_event_id): a concurrent identical upload won; (user, sequence): retry.
                $existing = MandarinPracticeEvent::query()->where('user_id', $user->id)->where('client_event_id', $clientEventId)->first();
                if ($existing !== null) {
                    return $existing->payload_hash === $payloadHash ? $this->accept($existing, 'already_present') : $this->reject($clientEventId, 'conflict');
                }
                if ($attempt === 2) {
                    throw $exception;
                }
            }
        }

        return $this->reject($clientEventId, 'conflict');
    }

    /** At most one schedule-changing result per target inside the window. */
    private function windowTaken(User $user, string $targetId): bool
    {
        $minutes = (int) config('mandarin.events.schedule_window_minutes', 10);

        return MandarinPracticeEvent::query()
            ->where('user_id', $user->id)
            ->where('target_id', $targetId)
            ->where('schedule_eligible', true)
            ->where('accepted_at', '>', now()->subMinutes($minutes))
            ->exists();
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function validate(CourseIndex $course, array $event): ?string
    {
        if (($event['schemaVersion'] ?? null) !== 1) {
            return 'unsupported_schema';
        }
        if (! in_array($event['kind'] ?? null, self::KINDS, true) || ! in_array($event['mode'] ?? null, self::MODES, true)) {
            return 'invalid_kind';
        }
        foreach (['clientInstanceId', 'sessionId', 'clientOccurredAt'] as $field) {
            if (! is_string($event[$field] ?? null) || $event[$field] === '' || strlen($event[$field]) > 128) {
                return 'invalid_payload';
            }
        }
        if (isset($event['sceneId']) && ! isset($course->scenes[$event['sceneId']])) {
            return 'unknown_scene';
        }
        if (isset($event['nodeId']) && ! isset($course->nodes[$event['nodeId']])) {
            return 'unknown_node';
        }
        $exerciseId = $event['exerciseId'] ?? null;
        if ($exerciseId !== null) {
            if (! is_string($exerciseId)) {
                return 'invalid_payload';
            }
            $choice = $course->choiceExercise($exerciseId);
            $construction = $course->constructions[$exerciseId] ?? null;
            if ($choice === null && $construction === null) {
                return 'unknown_exercise';
            }
            $selected = $event['selectedOptionId'] ?? null;
            if ($selected !== null) {
                $optionIds = $choice === null ? [] : array_column($choice['options'], 'id');
                if (! in_array($selected, $optionIds, true)) {
                    return 'invalid_option';
                }
            }
            $tiles = $event['orderedTileIds'] ?? null;
            if ($tiles !== null) {
                if (! is_array($tiles) || $construction === null) {
                    return 'invalid_option';
                }
                $tileIds = array_column($construction['tiles'], 'id');
                foreach ($tiles as $tile) {
                    if (! in_array($tile, $tileIds, true)) {
                        return 'invalid_option';
                    }
                }
            }
        } elseif ($event['kind'] === 'response' || $event['kind'] === 'checkpoint_exposure') {
            return 'unknown_exercise';
        }
        $evidence = $event['audioEvidence'] ?? null;
        if (! is_array($evidence) || ! in_array($evidence['status'] ?? null, ['completed', 'failed', 'skipped', 'not_required', 'simulated'], true)) {
            return 'invalid_payload';
        }
        if ($event['kind'] === 'response' && ! in_array($event['responseAction'] ?? null, ['answer', 'dont_know', 'skip'], true)) {
            return 'invalid_payload';
        }

        return null;
    }

    /**
     * Documented grading policy. Returns [correctness, grade, targetId].
     *
     * @param  array<string, mixed>  $event
     * @return array{0: string|null, 1: string|null, 2: string|null}
     */
    private function grade(CourseIndex $course, array $event): array
    {
        if ($event['kind'] !== 'response' || ! is_string($event['exerciseId'] ?? null)) {
            return [null, null, null];
        }
        $exerciseId = $event['exerciseId'];
        if (isset($event['orderedTileIds']) && is_array($event['orderedTileIds'])) {
            $construction = $course->constructions[$exerciseId] ?? null;
            if ($construction === null) {
                return [null, null, null];
            }

            return [$construction['correctTileIds'] === array_values($event['orderedTileIds']) ? 'correct' : 'incorrect', null, null];
        }
        $exercise = $course->choiceExercise($exerciseId);
        if ($exercise === null) {
            return [null, null, null];
        }
        $targetId = isset($exercise['primaryTargetId']) && is_string($exercise['primaryTargetId']) ? $exercise['primaryTargetId'] : null;
        $eligible = in_array($event['mode'], ['lesson', 'review'], true) && $targetId !== null;
        $evidence = $event['audioEvidence'];
        if ($event['responseAction'] === 'skip') {
            return ['unscored', null, $targetId];
        }
        if (($evidence['status'] ?? null) !== 'completed') {
            return ['unscored', null, $targetId];
        }
        if ($event['responseAction'] === 'dont_know') {
            return ['incorrect', $eligible ? 'Again' : null, $targetId];
        }
        $correct = ($event['selectedOptionId'] ?? null) === $exercise['correctOptionId'];
        if (! $correct) {
            return ['incorrect', $eligible ? 'Again' : null, $targetId];
        }
        if (! $eligible) {
            return ['correct', null, $targetId];
        }
        if (($event['textHelpUsed'] ?? false) === true || ($event['pinyinHelpUsed'] ?? false) === true) {
            return ['correct', 'Again', $targetId];
        }
        if ((int) ($evidence['slowPlayCount'] ?? 0) > 0 || (int) ($evidence['normalPlayCount'] ?? 0) > 1) {
            return ['correct', 'Hard', $targetId];
        }

        return ['correct', 'Good', $targetId];
    }

    private function parseTime(mixed $value): ?Carbon
    {
        if (! is_string($value)) {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array<string, mixed> */
    private function accept(MandarinPracticeEvent $row, string $status): array
    {
        return [
            'clientEventId' => $row->client_event_id,
            'status' => $status,
            'canonicalSequence' => $row->sequence,
            'serverAcceptedAt' => $row->accepted_at->toIso8601String(),
            'correctness' => $row->correctness,
            'grade' => $row->grade,
            'reasonCode' => null,
        ];
    }

    /** @return array<string, mixed> */
    private function reject(string $clientEventId, string $reason): array
    {
        return ['clientEventId' => $clientEventId, 'status' => 'rejected', 'canonicalSequence' => null, 'serverAcceptedAt' => null, 'correctness' => null, 'grade' => null, 'reasonCode' => $reason];
    }
}
