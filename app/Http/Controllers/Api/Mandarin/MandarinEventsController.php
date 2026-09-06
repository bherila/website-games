<?php

namespace App\Http\Controllers\Api\Mandarin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mandarin\AppendPracticeEventsRequest;
use App\Models\User;
use App\Services\Games\Mandarin\Progress\PracticeEventService;
use Illuminate\Http\JsonResponse;

class MandarinEventsController extends Controller
{
    public function store(AppendPracticeEventsRequest $request, PracticeEventService $events): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($events->append($user, $request->events()))
            ->header('Cache-Control', 'no-store')
            ->header('X-CSRF-TOKEN', csrf_token());
    }
}
