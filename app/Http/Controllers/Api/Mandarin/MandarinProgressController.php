<?php

namespace App\Http\Controllers\Api\Mandarin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Progress\ProgressProjector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MandarinProgressController extends Controller
{
    public function show(Request $request, CourseRepository $courses, ProgressProjector $projector): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $course = $courses->publishedOrFail();

        return response()->json($projector->project($user, $course))->header('Cache-Control', 'no-store');
    }
}
