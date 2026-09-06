<?php

namespace App\Services\Games\Mandarin\Progress;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseIndex;

/**
 * Canonical progress projection from the accepted event log. Story unlocks
 * come from node/scene completion events; listening schedules are computed
 * by the pinned TS scheduler adapter from the graded review log returned in
 * `listeningCards`, so no PHP FSRS implementation competes with it.
 */
class ProgressProjector
{
    /** @return array<string, mixed> */
    public function project(User $user, CourseIndex $course): array
    {
        $rows = MandarinPracticeEvent::query()
            ->where('user_id', $user->id)
            ->where('course_id', $course->courseId())
            ->orderBy('sequence')
            ->get(['sequence', 'kind', 'mode', 'node_id', 'scene_id', 'exercise_id', 'target_id', 'grade', 'schedule_eligible', 'accepted_at', 'content_version']);

        $completedNodes = [];
        $completedScenes = [];
        $exposed = [];
        $reviews = [];
        $lastSequence = 0;
        foreach ($rows as $row) {
            $lastSequence = max($lastSequence, (int) $row->sequence);
            if ($row->kind === 'node_complete' && $row->node_id !== null) {
                $completedNodes[$row->node_id] = true;
            } elseif ($row->kind === 'scene_complete' && $row->scene_id !== null) {
                $completedScenes[$row->scene_id] = true;
            } elseif ($row->kind === 'checkpoint_exposure' && $row->exercise_id !== null) {
                $exposed[$row->exercise_id] = true;
            }
            if ($row->grade !== null && $row->target_id !== null) {
                $reviews[] = [
                    'targetId' => $row->target_id,
                    'grade' => $row->grade,
                    'scheduleEligible' => (bool) $row->schedule_eligible,
                    'acceptedAt' => $row->accepted_at->toIso8601String(),
                    'sequence' => (int) $row->sequence,
                ];
            }
        }
        $completedInOrder = array_values(array_filter($course->nodeOrder, static fn (string $id): bool => isset($completedNodes[$id])));
        $currentNodeId = $course->nodeOrder[0] ?? '';
        if ($completedInOrder !== []) {
            $last = end($completedInOrder);
            $position = array_search($last, $course->nodeOrder, true);
            $currentNodeId = $position !== false && isset($course->nodeOrder[$position + 1]) ? $course->nodeOrder[$position + 1] : $last;
        }
        $windowMinutes = (int) config('mandarin.events.schedule_window_minutes', 10);
        $schedulerVersion = (string) config('mandarin.events.scheduler_version');

        return [
            'courseId' => $course->courseId(),
            'contentVersion' => $course->contentVersion(),
            'lastSequence' => $lastSequence,
            'completedNodeIds' => $completedInOrder,
            'completedSceneIds' => array_values(array_filter(array_keys($course->scenes), static fn (string $id): bool => isset($completedScenes[$id]))),
            'currentNodeId' => $currentNodeId,
            // Due targets are derived client-side by the pinned scheduler from `listeningCards.reviews`.
            'dueTargetIds' => [],
            'checkpointExposedIds' => array_keys($exposed),
            'schedulerVersion' => $schedulerVersion,
            'schedulerConfigHash' => hash('sha256', $schedulerVersion.':retention=0.90:window='.$windowMinutes.':fuzz=off'),
            'listeningCards' => [
                'kind' => 'graded-review-log',
                'desiredRetention' => 0.9,
                'windowMinutes' => $windowMinutes,
                'reviews' => $reviews,
            ],
        ];
    }
}
