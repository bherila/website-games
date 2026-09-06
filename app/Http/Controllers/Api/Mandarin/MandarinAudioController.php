<?php

namespace App\Http\Controllers\Api\Mandarin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mandarin\ResolveAudioRequest;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Course\CourseRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MandarinAudioController extends Controller
{
    /** POST /api/games/mandarin/audio/resolve — 202 while anything is pending, else 200. */
    public function resolve(ResolveAudioRequest $request, CourseRepository $courses, AudioAssetService $assets): JsonResponse
    {
        $course = $courses->revision((string) $request->validated('courseId'), (string) $request->validated('contentVersion'));
        if ($course === null) {
            return response()->json(['message' => 'Unknown course revision.'], 422)->header('Cache-Control', 'no-store');
        }
        $results = $assets->resolve($course, $request->sources(), $request->user() !== null);
        $pending = array_filter($results, static fn (array $result): bool => in_array($result['state'], ['queued', 'generating'], true));

        return response()->json([
            'courseId' => $course->courseId(),
            'contentVersion' => $course->contentVersion(),
            'results' => $results,
        ], $pending === [] ? 200 : 202)->header('Cache-Control', 'no-store')->header('X-CSRF-TOKEN', csrf_token());
    }

    /** GET /api/games/mandarin/audio/requests/{request} — never enqueues. */
    public function poll(Request $request, int $requestId, CourseRepository $courses, AudioAssetService $assets): JsonResponse
    {
        $course = $courses->publishedOrFail();
        $resolution = $assets->poll($course, $requestId);
        if ($resolution === null) {
            return response()->json(['message' => 'Unknown audio request.'], 404)->header('Cache-Control', 'no-store');
        }

        return response()->json($resolution)->header('Cache-Control', 'no-store');
    }
}
