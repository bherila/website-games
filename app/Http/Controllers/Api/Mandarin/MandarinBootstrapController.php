<?php

namespace App\Http\Controllers\Api\Mandarin;

use App\Http\Controllers\Controller;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/games/mandarin/bootstrap — course + capabilities. Read-only; never generates. */
class MandarinBootstrapController extends Controller
{
    public function show(Request $request, CourseRepository $courses, SpeechSynthesizer $speech): JsonResponse
    {
        $course = $courses->published();
        if ($course === null) {
            return response()->json(['message' => 'No published Mandarin course.'], 503)->header('Cache-Control', 'no-store');
        }
        $user = $request->user();
        $generationEnabled = (bool) config('mandarin.speech.generation_enabled') && $speech->id() !== 'null';

        return response()->json([
            'runtime' => 'live',
            'course' => $course->learnerPayload(),
            'account' => [
                'signedIn' => $user !== null,
                'accountPartitionId' => $user === null ? null : 'user:'.$user->getKey(),
            ],
            'capabilities' => [
                'canGenerateAudio' => $user !== null && $generationEnabled,
                'canSaveToAccount' => $user !== null,
                'hasDistinctMandarinVoices' => $speech->hasDistinctMandarinVoices(),
            ],
            'audio' => ['courseId' => $course->courseId(), 'contentVersion' => $course->contentVersion(), 'results' => []],
            'serverTime' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store')->header('X-CSRF-TOKEN', csrf_token());
    }
}
