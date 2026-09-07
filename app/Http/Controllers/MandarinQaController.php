<?php

namespace App\Http\Controllers;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;

/**
 * Read-only audition sheet for the published course revision: every line, its
 * pinyin and gloss, and whichever audio has actually been generated.
 *
 * It is a listening tool, not a generator. Resolution runs with
 * `allowGenerate: false`, so opening the page can never call a provider,
 * enqueue a job or spend budget — a line without audio is reported as such.
 *
 * @phpstan-type QaCell array{variant: string, state: string, ready: bool, url: string|null, contentType: string|null, label: string, provider: string|null, voice: string|null, durationMs: int|null}
 * @phpstan-type QaItem array{kind: string, id: string, zh: string, pinyin: string, en: string, usage: string, role: string, reserved: bool, cells: list<QaCell>}
 * @phpstan-type QaGroup array{title: string, note: string, items: list<QaItem>}
 */
class MandarinQaController extends Controller
{
    /** Variants offered per source, in the order a reviewer wants to hear them. */
    private const VARIANTS = ['normal', 'slow'];

    /** @var array{ready: int, pending: int, failed: int, unavailable: int} */
    private array $tally = ['ready' => 0, 'pending' => 0, 'failed' => 0, 'unavailable' => 0];

    public function __invoke(CourseRepository $courses, AudioAssetService $assets, SpeechSynthesizer $speech): Response
    {
        abort_if(app()->environment('production') && ! config('mandarin.qa_enabled'), 404);

        $course = $courses->publishedOrFail();
        $revision = $courses->revisionModel($course->courseId(), $course->contentVersion());
        /** @var Collection<int, MandarinAudioAsset> $rows */
        $rows = MandarinAudioAsset::query()->where('state', MandarinAudioAsset::STATE_READY)->get()->keyBy('id');

        return response()->view('games.mandarin-qa', [
            'course' => $course,
            'groups' => $this->groups($course, $assets, $rows),
            'tally' => $this->tally,
            'providerId' => $speech->id(),
            'distinctVoices' => $speech->hasDistinctMandarinVoices(),
            'nativeReviewed' => $revision !== null && $revision->native_reviewed,
            'audioAuditioned' => $revision !== null && $revision->audio_auditioned,
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * Utterances grouped by scene (the reserved checkpoint lines carry no scene
     * and get their own group), then every target.
     *
     * @param  Collection<int, MandarinAudioAsset>  $rows
     * @return list<QaGroup>
     */
    private function groups(CourseIndex $course, AudioAssetService $assets, Collection $rows): array
    {
        $scenes = array_values($course->scenes);
        usort($scenes, static fn (array $a, array $b): int => $a['order'] <=> $b['order']);

        /** @var array<string, list<QaItem>> $bySceneId */
        $bySceneId = [];
        foreach ($course->utterances as $utterance) {
            $sceneId = isset($utterance['sceneId']) ? (string) $utterance['sceneId'] : '';
            $roleId = (string) $utterance['roleId'];
            $id = (string) $utterance['id'];
            $bySceneId[$sceneId][] = [
                'kind' => 'utterance',
                'id' => $id,
                'zh' => (string) $utterance['zh'],
                'pinyin' => (string) $utterance['pinyin'],
                'en' => (string) $utterance['en'],
                'usage' => (string) $utterance['usage'],
                'role' => (string) ($course->roles[$roleId]['name'] ?? $roleId),
                'reserved' => $course->isReservedUtterance($id),
                'cells' => $this->cells($course, $assets, $rows, 'utterance', $id),
            ];
        }

        /** @var list<QaGroup> $groups */
        $groups = [];
        foreach ($scenes as $scene) {
            $sceneId = (string) $scene['id'];
            $items = $bySceneId[$sceneId] ?? [];
            unset($bySceneId[$sceneId]);
            if ($items === []) {
                continue;
            }
            $groups[] = [
                'title' => 'Scene '.$scene['order'].' — '.$scene['title'],
                'note' => (string) $scene['objective'],
                'items' => $items,
            ];
        }

        /** @var list<QaItem> $loose */
        $loose = [];
        foreach ($bySceneId as $items) {
            foreach ($items as $item) {
                $loose[] = $item;
            }
        }
        if ($loose !== []) {
            $groups[] = [
                'title' => 'Reserved for the listening check',
                'note' => 'Never taught and never practised; these lines appear only in the listening check after the last node.',
                'items' => $loose,
            ];
        }

        /** @var list<QaItem> $targets */
        $targets = [];
        foreach ($course->targets as $target) {
            $id = (string) $target['id'];
            $targets[] = [
                'kind' => 'target',
                'id' => $id,
                'zh' => (string) $target['zh'],
                'pinyin' => (string) $target['pinyin'],
                'en' => (string) $target['en'],
                'usage' => 'target',
                'role' => 'Narrator',
                'reserved' => false,
                'cells' => $this->cells($course, $assets, $rows, 'target', $id),
            ];
        }
        if ($targets !== []) {
            $groups[] = [
                'title' => 'Targets',
                'note' => 'The vocabulary and constructions the course scores, read by the narrator.',
                'items' => $targets,
            ];
        }

        /** @var list<QaItem> $supports */
        $supports = [];
        foreach ($course->supports as $support) {
            $id = (string) $support['id'];
            $supports[] = [
                'kind' => 'support',
                'id' => $id,
                'zh' => (string) $support['zh'],
                'pinyin' => (string) $support['pinyin'],
                'en' => (string) $support['en'],
                'usage' => 'support',
                'role' => 'Narrator',
                'reserved' => false,
                'cells' => $this->cells($course, $assets, $rows, 'support', $id),
            ];
        }
        if ($supports !== []) {
            $groups[] = [
                'title' => 'Supporting glossary',
                'note' => 'Context words that can be heard and practised but never become scheduled mastery cards.',
                'items' => $supports,
            ];
        }

        return $groups;
    }

    /**
     * @param  Collection<int, MandarinAudioAsset>  $rows
     * @return list<QaCell>
     */
    private function cells(CourseIndex $course, AudioAssetService $assets, Collection $rows, string $kind, string $id): array
    {
        $cells = [];
        foreach (self::VARIANTS as $variant) {
            if (! $course->hasSource($kind, $id, $variant)) {
                continue;
            }
            // `generation_disabled` is the honest reason on this page: it never
            // generates, whoever is signed in.
            $result = $assets->resolveOne($course, ['sourceKind' => $kind, 'sourceId' => $id, 'variant' => $variant], false, 'generation_disabled');
            $state = (string) $result['state'];
            $asset = $state === 'ready' ? $rows->get((int) $result['assetId']) : null;
            $recipe = $asset === null ? [] : $asset->recipeArray();
            $code = isset($result['code']) ? (string) $result['code'] : null;
            $this->tally[$this->bucket($state)]++;
            $cells[] = [
                'variant' => $variant,
                'state' => $state,
                'ready' => $state === 'ready',
                'url' => $state === 'ready' ? (string) $result['url'] : null,
                'contentType' => $state === 'ready' ? (string) $result['contentType'] : null,
                'label' => match ($state) {
                    'ready' => 'ready',
                    'queued', 'generating' => $state,
                    default => $state.($code === null ? '' : ': '.$code),
                },
                'provider' => $asset?->provider,
                'voice' => isset($recipe['voice']) ? (string) $recipe['voice'] : null,
                'durationMs' => $asset?->duration_ms,
            ];
        }

        return $cells;
    }

    /** @return 'ready'|'pending'|'failed'|'unavailable' */
    private function bucket(string $state): string
    {
        return match ($state) {
            'ready' => 'ready',
            'queued', 'generating' => 'pending',
            'failed' => 'failed',
            default => 'unavailable',
        };
    }
}
