<?php

namespace App\Http\Controllers\Api;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Http\Controllers\Controller;
use App\Http\Requests\BatchGameDataRequest;
use App\Http\Requests\GameDataRouteRequest;
use App\Http\Requests\IndexGameDataRequest;
use App\Http\Requests\UpsertGameDataRequest;
use App\Http\Resources\UserGameDataResource;
use App\Models\User;
use App\Services\Games\GameDataStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GameDataController extends Controller
{
    public function __construct(private readonly GameDataStore $store) {}

    public function index(IndexGameDataRequest $request): JsonResponse
    {
        $user = $this->user($request);
        $query = $user->gameData();
        $gameSlugs = $request->gameSlugs();
        if ($gameSlugs !== null) {
            $query->whereIn('game', array_map(
                static fn (GameSlug $game): string => $game->value,
                $gameSlugs,
            ));
        }
        if (! $request->includesSaves()) {
            $query
                ->where('is_deleted', false)
                ->where('scope', '!=', GameDataScope::Save->value);
        }

        $rows = $query
            ->orderBy('game')
            ->orderBy('scope')
            ->orderBy('slot')
            ->get();

        return response()
            ->json([
                'data' => UserGameDataResource::collection($rows)->resolve($request),
            ])
            ->header('X-CSRF-TOKEN', csrf_token());
    }

    public function update(UpsertGameDataRequest $request): JsonResponse
    {
        $result = $this->store->upsert(
            $this->user($request),
            $request->gameSlug(),
            $request->dataScope(),
            $request->slotKey(),
            $request->gameData(),
            $request->expectedRevision(),
            $request->writerId(),
            $request->writerSequence(),
        );

        return response()->json([
            'data' => $result['row'] ? (new UserGameDataResource($result['row']))->resolve($request) : null,
            'status' => $result['status'],
        ]);
    }

    public function batch(BatchGameDataRequest $request): JsonResponse
    {
        $results = $this->store->batch(
            $this->user($request),
            $request->gameSlug(),
            $request->gameDataOperations(),
        );

        return response()->json([
            'data' => array_map(static fn (array $result): array => [
                'action' => $result['action'],
                'scope' => $result['scope']->value,
                'slot' => $result['slot'],
                'status' => $result['status'],
                'row' => $result['row'] ? (new UserGameDataResource($result['row']))->resolve($request) : null,
            ], $results),
        ]);
    }

    public function destroy(GameDataRouteRequest $request): JsonResponse
    {
        $this->store->delete(
            $this->user($request),
            $request->gameSlug(),
            $request->dataScope(),
            $request->slotKey(),
            $request->expectedRevision(),
            $request->writerId(),
            $request->writerSequence(),
        );

        return response()->json(status: 204);
    }

    private function user(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
