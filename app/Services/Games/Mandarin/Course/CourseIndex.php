<?php

namespace App\Services\Games\Mandarin\Course;

/**
 * In-memory index over one validated course revision. Built once per request
 * from the stored payload; the alpha needs lookups, not dozens of tables.
 */
class CourseIndex
{
    /** @var array<string, array<string, mixed>> */
    public readonly array $scenes;

    /** @var array<string, array<string, mixed>> */
    public readonly array $nodes;

    /** @var array<string, array<string, mixed>> */
    public readonly array $targets;

    /** @var array<string, array<string, mixed>> */
    public readonly array $utterances;

    /** @var array<string, array<string, mixed>> */
    public readonly array $exercises;

    /** @var array<string, array<string, mixed>> */
    public readonly array $checkpoints;

    /** @var array<string, array<string, mixed>> */
    public readonly array $constructions;

    /** @var array<string, array<string, mixed>> */
    public readonly array $roles;

    /** @var array<string, array<string, mixed>> */
    public readonly array $sfx;

    /** @var list<string> node ids in journey order */
    public readonly array $nodeOrder;

    /**
     * @param  array<string, mixed>  $course
     */
    public function __construct(public readonly array $course)
    {
        $by = static fn (array $items): array => array_combine(array_column($items, 'id'), $items) ?: [];
        $this->scenes = $by($course['scenes']);
        $this->nodes = $by($course['nodes']);
        $this->targets = $by($course['targets']);
        $this->utterances = $by($course['utterances']);
        $this->exercises = $by($course['exercises']);
        $this->checkpoints = $by($course['checkpointExercises']);
        $this->constructions = $by($course['constructionExercises']);
        $this->roles = $by($course['roles']);
        $this->sfx = $by($course['sfx']);
        $scenes = $course['scenes'];
        usort($scenes, static fn (array $a, array $b): int => $a['order'] <=> $b['order']);
        $order = [];
        foreach ($scenes as $scene) {
            foreach ($scene['nodeIds'] as $nodeId) {
                $order[] = $nodeId;
            }
        }
        $this->nodeOrder = $order;
    }

    public function courseId(): string
    {
        return (string) $this->course['courseId'];
    }

    public function contentVersion(): string
    {
        return (string) $this->course['contentVersion'];
    }

    /** @return array<string, mixed>|null */
    public function choiceExercise(string $id): ?array
    {
        return $this->exercises[$id] ?? $this->checkpoints[$id] ?? null;
    }

    public function isReservedUtterance(string $id): bool
    {
        return ($this->utterances[$id]['usage'] ?? null) === 'checkpoint_reserved';
    }

    /** Text a speech provider should read for a source, or null when the source is unknown. */
    public function speechText(string $sourceKind, string $sourceId): ?string
    {
        return match ($sourceKind) {
            'utterance' => isset($this->utterances[$sourceId]) ? (string) $this->utterances[$sourceId]['speechText'] : null,
            'target' => isset($this->targets[$sourceId]) ? (string) $this->targets[$sourceId]['speechText'] : null,
            default => null,
        };
    }

    /** Story role for a source; targets are read by the narrator. */
    public function roleFor(string $sourceKind, string $sourceId): string
    {
        if ($sourceKind === 'utterance' && isset($this->utterances[$sourceId])) {
            return (string) $this->utterances[$sourceId]['roleId'];
        }

        return 'narrator';
    }

    public function sfxRecipe(string $sfxId): ?string
    {
        return isset($this->sfx[$sfxId]) ? (string) $this->sfx[$sfxId]['recipe'] : null;
    }

    /** Whether a source id / variant pair is an allowlisted audio source in this revision. */
    public function hasSource(string $sourceKind, string $sourceId, string $variant): bool
    {
        return match ($sourceKind) {
            'utterance' => isset($this->utterances[$sourceId]) && in_array($variant, $this->utterances[$sourceId]['audioVariants'], true),
            'target' => isset($this->targets[$sourceId]) && in_array($variant, ['normal', 'slow'], true),
            'sfx' => isset($this->sfx[$sourceId]) && $variant === 'default',
            default => false,
        };
    }

    /**
     * Learner-facing payload: identical to the file, since answer keys are not secret in this personal alpha.
     *
     * @return array<string, mixed>
     */
    public function learnerPayload(): array
    {
        return $this->course;
    }
}
