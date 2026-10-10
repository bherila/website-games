<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioCatalog;
use App\Services\Games\Mandarin\Audio\AudioDeliveryService;
use App\Services\Games\Mandarin\Audio\AudioOperations;
use App\Services\Games\Mandarin\Course\CourseIndex;
use App\Services\Games\Mandarin\Course\CourseRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The admin panel's audio dashboard for the published course revision: a filterable, paginated
 * list of every source with its asset state, and the four paid actions. Routing puts every
 * endpoint behind `auth`, the `administer` gate and a throttle; the actions are POSTs, so they
 * also carry the CSRF token.
 *
 * Listing never generates anything. Every action is idempotent and never queues a source that
 * is already queued or generating ({@see AudioOperations}). Regenerating a ready clip and
 * queueing every missing one cost money, so they need `confirm=1` as well.
 */
class MandarinAudioAdminController extends Controller
{
    private const PER_PAGE = 25;

    public function index(Request $request, CourseRepository $courses, AudioCatalog $catalog, AudioDeliveryService $delivery): JsonResponse
    {
        $filters = $request->validate([
            'state' => ['nullable', Rule::in(AudioCatalog::STATES)],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);
        $course = $courses->published();
        if ($course === null) {
            return $this->noCourse();
        }

        $entries = $catalog->entries($course);
        $summary = $catalog->summary($entries);
        $state = $filters['state'] ?? null;
        $query = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $matching = array_values(array_filter($entries, static fn (array $entry): bool => ($state === null || $entry['state'] === $state)
            && ($query === '' || str_contains(mb_strtolower($entry['key'].' '.$entry['text'].' '.$entry['pinyin'].' '.$entry['en'].' '.$entry['role']), $query))));

        $perPage = (int) ($filters['per_page'] ?? self::PER_PAGE);
        $lastPage = max(1, (int) ceil(count($matching) / $perPage));
        $page = min((int) ($filters['page'] ?? 1), $lastPage);
        $slice = array_slice($matching, ($page - 1) * $perPage, $perPage);

        // Playback URLs only for the rows on this page: a temporary URL can cost a signing call.
        $ready = MandarinAudioAsset::query()
            ->whereKey(array_values(array_filter(array_map(static fn (array $entry): ?int => $entry['state'] === 'ready' ? $entry['assetId'] : null, $slice))))
            ->get()->keyBy('id');
        $rows = array_map(static function (array $entry) use ($ready, $delivery): array {
            $asset = $entry['assetId'] === null ? null : $ready->get($entry['assetId']);

            return $entry + ['url' => $asset === null ? null : $delivery->url($asset)['url'], 'contentType' => $asset?->content_type];
        }, $slice);

        return response()->json([
            'course' => ['courseId' => $course->courseId(), 'contentVersion' => $course->contentVersion()],
            'generationEnabled' => (bool) config('mandarin.speech.generation_enabled'),
            'summary' => $summary,
            'pending' => $summary['queued'] + $summary['generating'] > 0,
            'entries' => $rows,
            'page' => $page,
            'perPage' => $perPage,
            'lastPage' => $lastPage,
            'total' => count($matching),
        ])->header('Cache-Control', 'no-store');
    }

    /** POST: queue one missing or failed source. */
    public function request(Request $request, CourseRepository $courses, AudioCatalog $catalog, AudioOperations $operations): JsonResponse
    {
        return $this->forSource($request, $courses, $catalog, false, fn (CourseIndex $course, array $source, User $actor): array => $operations->request($course, $source, $actor));
    }

    /** POST: generate a ready source again; needs `confirm=1`. */
    public function regenerate(Request $request, CourseRepository $courses, AudioCatalog $catalog, AudioOperations $operations): JsonResponse
    {
        return $this->forSource($request, $courses, $catalog, true, fn (CourseIndex $course, array $source, User $actor): array => $operations->regenerate($course, $source, $actor));
    }

    /** POST: queue every missing source; needs `confirm=1`. */
    public function requestMissing(Request $request, CourseRepository $courses, AudioOperations $operations): JsonResponse
    {
        $request->validate(['confirm' => ['accepted']]);
        $course = $courses->published();

        return $course === null ? $this->noCourse() : $this->result($operations->requestMissing($course, $this->actor($request)));
    }

    /** POST: queue every failed source again. */
    public function retryFailed(Request $request, CourseRepository $courses, AudioOperations $operations): JsonResponse
    {
        $course = $courses->published();

        return $course === null ? $this->noCourse() : $this->result($operations->retryFailed($course, $this->actor($request)));
    }

    /**
     * @param  callable(CourseIndex, array{sourceKind: string, sourceId: string, variant: string}, User): array{action: string, queued: int, skipped: list<array{key: string, reason: string}>}  $action
     */
    private function forSource(Request $request, CourseRepository $courses, AudioCatalog $catalog, bool $confirm, callable $action): JsonResponse
    {
        $request->validate([
            'source' => ['required', 'string', 'max:160', 'regex:/^(utterance|target|support|sfx):[A-Za-z0-9_-]{1,64}:(normal|slow|default)$/'],
            ...($confirm ? ['confirm' => ['accepted']] : []),
        ]);
        $course = $courses->published();
        if ($course === null) {
            return $this->noCourse();
        }
        $source = $catalog->source($course, (string) $request->input('source'));
        if ($source === null) {
            return response()->json(['message' => 'That source is not part of the published course revision.', 'errors' => ['source' => ['Unknown source.']]], 422);
        }

        return $this->result($action($course, $source, $this->actor($request)));
    }

    /** @param array{action: string, queued: int, skipped: list<array{key: string, reason: string}>} $result */
    private function result(array $result): JsonResponse
    {
        return response()->json($result)->header('Cache-Control', 'no-store');
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    private function noCourse(): JsonResponse
    {
        return response()->json(['message' => 'No published Mandarin course.'], 503)->header('Cache-Control', 'no-store');
    }
}
