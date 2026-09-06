<?php

namespace App\Services\Games\Mandarin\Course;

/**
 * Structural + referential validation of a course payload. Mirrors
 * resources/js/games/mandarin/domain/courseSchema.ts so preview and live
 * imports reject the same documents. Returns problems; never throws on data.
 */
class CourseValidator
{
    /**
     * @param  array<string, mixed>  $course
     * @return list<string>
     */
    public function validate(array $course): array
    {
        $problems = $this->structure($course);
        if ($problems !== []) {
            return $problems;
        }

        return $this->semantics($course);
    }

    /**
     * @param  array<string, mixed>  $course
     * @return list<string>
     */
    private function structure(array $course): array
    {
        $problems = [];
        foreach (['schemaVersion', 'courseId', 'contentVersion', 'title', 'locale', 'provenance', 'roles', 'scenes', 'nodes', 'targets', 'supportGlossary', 'utterances', 'exercises', 'constructionExercises', 'checkpointExercises', 'checkpointPolicy', 'teachingPolicy', 'audioPolicy', 'sfx'] as $key) {
            if (! array_key_exists($key, $course)) {
                $problems[] = "missing top-level key {$key}";
            }
        }
        if ($problems !== []) {
            return $problems;
        }
        if (($course['schemaVersion'] ?? null) !== 1) {
            $problems[] = 'schemaVersion must be 1';
        }
        foreach (['courseId', 'contentVersion', 'title'] as $key) {
            if (! is_string($course[$key]) || $course[$key] === '') {
                $problems[] = "{$key} must be a non-empty string";
            }
        }
        if (! is_array($course['locale']) || ! is_string($course['locale']['spokenLanguage'] ?? null)) {
            $problems[] = 'locale.spokenLanguage must be a string';
        }
        foreach (['roles', 'scenes', 'nodes', 'targets', 'supportGlossary', 'utterances', 'exercises', 'constructionExercises', 'checkpointExercises', 'sfx'] as $key) {
            if (! is_array($course[$key]) || ! array_is_list($course[$key])) {
                $problems[] = "{$key} must be a list";

                continue;
            }
            foreach ($course[$key] as $index => $item) {
                if (! is_array($item) || ! isset($item['id']) || ! is_string($item['id']) || $item['id'] === '') {
                    $problems[] = "{$key}[{$index}] must have a string id";
                }
            }
        }
        $requiredFields = [
            'scenes' => ['order', 'title', 'setting', 'objective', 'setup', 'nodeIds', 'dialogueUtteranceIds', 'artSlotId', 'grammarNote', 'unlockAfterSceneId'],
            'nodes' => ['sceneId', 'order', 'title', 'introducedTargetIds', 'introducedSupportIds', 'teachingUtteranceIds', 'exerciseIds', 'constructionIds', 'prerequisites'],
            'targets' => ['zh', 'pinyin', 'en', 'introducedInNode', 'speechText', 'notes'],
            'supportGlossary' => ['zh', 'pinyin', 'en', 'introducedInNode'],
            'utterances' => ['roleId', 'zh', 'pinyin', 'en', 'speechText', 'nodeId', 'sceneId', 'requiresTargetIds', 'usage', 'audioVariants'],
            'exercises' => ['kind', 'phase', 'nodeId', 'sceneId', 'primaryTargetId', 'promptAudio', 'question', 'options', 'correctOptionId', 'explanation', 'allowSlow', 'allowTextHelp', 'shuffleOptions'],
            'checkpointExercises' => ['kind', 'phase', 'promptAudio', 'question', 'options', 'correctOptionId', 'explanation', 'allowSlow', 'allowTextHelp', 'shuffleOptions'],
            'constructionExercises' => ['kind', 'phase', 'nodeId', 'sceneId', 'sourceUtteranceId', 'question', 'tiles', 'correctTileIds', 'displayAnswer', 'explanation'],
            'roles' => ['name', 'portraitSlotId'],
            'sfx' => ['recipe', 'purpose', 'maxDurationMs'],
        ];
        foreach ($requiredFields as $key => $fields) {
            if (! is_array($course[$key])) {
                continue;
            }
            foreach ($course[$key] as $item) {
                if (! is_array($item)) {
                    continue;
                }
                foreach ($fields as $field) {
                    if (! array_key_exists($field, $item)) {
                        $problems[] = "{$key} ".($item['id'] ?? '?')." is missing {$field}";
                    }
                }
            }
        }
        foreach (array_merge($course['exercises'] ?? [], $course['checkpointExercises'] ?? []) as $exercise) {
            if (is_array($exercise) && isset($exercise['options']) && (! is_array($exercise['options']) || count($exercise['options']) !== 3)) {
                $problems[] = 'exercise '.($exercise['id'] ?? '?').' must have exactly three options';
            }
        }
        if (! is_array($course['checkpointPolicy']) || ! isset($course['checkpointPolicy']['unlockAfterNodeId'])) {
            $problems[] = 'checkpointPolicy.unlockAfterNodeId is required';
        }
        if (! is_array($course['teachingPolicy']) || ! isset($course['teachingPolicy']['maximumNewPrimaryTargetsPerNode'])) {
            $problems[] = 'teachingPolicy.maximumNewPrimaryTargetsPerNode is required';
        }

        return $problems;
    }

    /**
     * @param  array<string, mixed>  $course
     * @return list<string>
     */
    private function semantics(array $course): array
    {
        $problems = [];
        $index = function (array $items, string $label) use (&$problems): array {
            $map = [];
            foreach ($items as $item) {
                if (isset($map[$item['id']])) {
                    $problems[] = "{$label} id duplicated: {$item['id']}";
                }
                $map[$item['id']] = $item;
            }

            return $map;
        };
        $scenes = $index($course['scenes'], 'scene');
        $nodes = $index($course['nodes'], 'node');
        $targets = $index($course['targets'], 'target');
        $supports = $index($course['supportGlossary'], 'support');
        $utterances = $index($course['utterances'], 'utterance');
        $exercises = $index($course['exercises'], 'exercise');
        $constructions = $index($course['constructionExercises'], 'construction');
        $checkpoints = $index($course['checkpointExercises'], 'checkpoint');
        $roles = $index($course['roles'], 'role');
        $maxTargets = (int) $course['teachingPolicy']['maximumNewPrimaryTargetsPerNode'];

        foreach ($course['scenes'] as $scene) {
            foreach ($scene['nodeIds'] as $nodeId) {
                if (! isset($nodes[$nodeId])) {
                    $problems[] = "scene {$scene['id']} references missing node {$nodeId}";
                } elseif ($nodes[$nodeId]['sceneId'] !== $scene['id']) {
                    $problems[] = "node {$nodeId} belongs to {$nodes[$nodeId]['sceneId']}, listed under {$scene['id']}";
                }
            }
            foreach ($scene['dialogueUtteranceIds'] as $utteranceId) {
                if (! isset($utterances[$utteranceId])) {
                    $problems[] = "scene {$scene['id']} references missing utterance {$utteranceId}";
                } elseif ($utterances[$utteranceId]['usage'] === 'checkpoint_reserved') {
                    $problems[] = "scene {$scene['id']} exposes reserved utterance {$utteranceId}";
                }
            }
            if ($scene['unlockAfterSceneId'] !== null && ! isset($scenes[$scene['unlockAfterSceneId']])) {
                $problems[] = "scene {$scene['id']} unlocks after missing scene {$scene['unlockAfterSceneId']}";
            }
        }

        foreach ($course['nodes'] as $node) {
            if (! isset($scenes[$node['sceneId']])) {
                $problems[] = "node {$node['id']} references missing scene {$node['sceneId']}";
            }
            if (count($node['introducedTargetIds']) > $maxTargets) {
                $problems[] = "node {$node['id']} introduces more than {$maxTargets} targets";
            }
            foreach ($node['introducedTargetIds'] as $targetId) {
                if (! isset($targets[$targetId])) {
                    $problems[] = "node {$node['id']} introduces missing target {$targetId}";
                } elseif ($targets[$targetId]['introducedInNode'] !== $node['id']) {
                    $problems[] = "target {$targetId} says it is introduced in {$targets[$targetId]['introducedInNode']}, not {$node['id']}";
                }
            }
            foreach ($node['introducedSupportIds'] as $supportId) {
                if (! isset($supports[$supportId])) {
                    $problems[] = "node {$node['id']} introduces missing support {$supportId}";
                }
            }
            foreach ($node['teachingUtteranceIds'] as $utteranceId) {
                if (! isset($utterances[$utteranceId])) {
                    $problems[] = "node {$node['id']} teaches missing utterance {$utteranceId}";
                } elseif ($utterances[$utteranceId]['usage'] === 'checkpoint_reserved') {
                    $problems[] = "node {$node['id']} teaches reserved utterance {$utteranceId}";
                }
            }
            foreach ($node['exerciseIds'] as $exerciseId) {
                if (! isset($exercises[$exerciseId])) {
                    $problems[] = "node {$node['id']} references missing exercise {$exerciseId}";
                } elseif ($exercises[$exerciseId]['nodeId'] !== $node['id']) {
                    $problems[] = "exercise {$exerciseId} belongs to {$exercises[$exerciseId]['nodeId']}, listed under {$node['id']}";
                }
            }
            foreach ($node['constructionIds'] as $constructionId) {
                if (! isset($constructions[$constructionId])) {
                    $problems[] = "node {$node['id']} references missing construction {$constructionId}";
                }
            }
            foreach ($node['prerequisites'] as $prerequisite) {
                if (! isset($nodes[$prerequisite])) {
                    $problems[] = "node {$node['id']} requires missing node {$prerequisite}";
                }
            }
        }

        $reservedTexts = [];
        foreach ($course['utterances'] as $utterance) {
            if (! isset($roles[$utterance['roleId']])) {
                $problems[] = "utterance {$utterance['id']} has unknown role {$utterance['roleId']}";
            }
            foreach ($utterance['requiresTargetIds'] as $targetId) {
                if (! isset($targets[$targetId])) {
                    $problems[] = "utterance {$utterance['id']} requires missing target {$targetId}";
                }
            }
            if ($utterance['usage'] === 'checkpoint_reserved') {
                if ($utterance['nodeId'] !== null || $utterance['sceneId'] !== null) {
                    $problems[] = "reserved utterance {$utterance['id']} must not be attached to a node or scene";
                }
                $reservedTexts[$utterance['zh']] = $utterance['id'];
            }
        }
        foreach ($course['utterances'] as $utterance) {
            if ($utterance['usage'] !== 'checkpoint_reserved' && isset($reservedTexts[$utterance['zh']])) {
                $problems[] = "training utterance {$utterance['id']} repeats reserved sentence {$reservedTexts[$utterance['zh']]}";
            }
        }

        $checkChoice = function (array $exercise, bool $reserved) use (&$problems, $targets, $utterances): void {
            $optionIds = array_map(static fn (array $option): string => $option['id'], $exercise['options']);
            if (count(array_unique($optionIds)) !== count($optionIds)) {
                $problems[] = "exercise {$exercise['id']} has duplicate option ids";
            }
            if (! in_array($exercise['correctOptionId'], $optionIds, true)) {
                $problems[] = "exercise {$exercise['id']} correct option {$exercise['correctOptionId']} is not one of its options";
            }
            if (($exercise['primaryTargetId'] ?? null) !== null && ! isset($targets[$exercise['primaryTargetId']])) {
                $problems[] = "exercise {$exercise['id']} targets missing {$exercise['primaryTargetId']}";
            }
            foreach ($exercise['promptAudio'] as $ref) {
                if ($ref['sourceKind'] === 'utterance') {
                    if (! isset($utterances[$ref['sourceId']])) {
                        $problems[] = "exercise {$exercise['id']} plays missing utterance {$ref['sourceId']}";
                    } elseif (($utterances[$ref['sourceId']]['usage'] === 'checkpoint_reserved') !== $reserved) {
                        $problems[] = "exercise {$exercise['id']} ".($reserved ? 'must use' : 'must not use')." a reserved utterance ({$ref['sourceId']})";
                    }
                } elseif (! isset($targets[$ref['sourceId']])) {
                    $problems[] = "exercise {$exercise['id']} plays missing target {$ref['sourceId']}";
                }
            }
        };
        foreach ($course['exercises'] as $exercise) {
            if ($exercise['phase'] !== 'training') {
                $problems[] = "exercise {$exercise['id']} is not a training exercise";
            }
            $checkChoice($exercise, false);
        }
        foreach ($course['checkpointExercises'] as $exercise) {
            if ($exercise['phase'] !== 'checkpoint') {
                $problems[] = "checkpoint {$exercise['id']} is not a checkpoint exercise";
            }
            $checkChoice($exercise, true);
        }
        foreach ($course['constructionExercises'] as $construction) {
            if (! isset($utterances[$construction['sourceUtteranceId']])) {
                $problems[] = "construction {$construction['id']} sources missing utterance {$construction['sourceUtteranceId']}";
            }
            $tileIds = array_map(static fn (array $tile): string => $tile['id'], $construction['tiles']);
            if (count($construction['correctTileIds']) !== count($tileIds) || array_diff($construction['correctTileIds'], $tileIds) !== []) {
                $problems[] = "construction {$construction['id']} answer does not use exactly its tiles";
            }
        }
        if (! isset($nodes[$course['checkpointPolicy']['unlockAfterNodeId']])) {
            $problems[] = "checkpoint unlocks after missing node {$course['checkpointPolicy']['unlockAfterNodeId']}";
        }
        if ($checkpoints === []) {
            $problems[] = 'no checkpoint exercises';
        }

        return $problems;
    }

    /**
     * Canonical hash: sorted keys, no whitespace, unescaped unicode. Stable
     * across pretty-printing so a reformatted file is still the same revision.
     *
     * @param  array<string, mixed>  $course
     */
    public static function canonicalHash(array $course): string
    {
        return hash('sha256', self::canonicalJson($course));
    }

    public static function canonicalJson(mixed $value): string
    {
        return json_encode(self::sortKeys($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private static function sortKeys(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(self::sortKeys(...), $value);
        }
        ksort($value, SORT_STRING);

        return array_map(self::sortKeys(...), $value);
    }
}
