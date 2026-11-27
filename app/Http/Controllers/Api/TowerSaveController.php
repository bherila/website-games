<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Games\AcquireTowerLeaseRequest;
use App\Http\Requests\Games\ReleaseTowerLeaseRequest;
use App\Http\Requests\Games\StoreTowerSaveRequest;
use App\Http\Requests\Games\TowerSaveSlotRouteRequest;
use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Server-side cloud save sync for Tower Throwback. Every slot is auth-scoped to
 * the authenticated user; the client-supplied identity is never trusted. Slots
 * carry an opaque save payload plus a single-holder ownership lease so that a
 * second device is asked to "take over" rather than silently clobbering play.
 */
class TowerSaveController extends Controller
{
    /** GET — slot metadata for every populated / leased slot (never the payload). */
    public function index(Request $request): JsonResponse
    {
        $slots = $this->user($request)
            ->towerSaveSlots()
            ->orderBy('slot')
            ->get();

        return response()->json([
            'data' => $slots->map(fn (TowerSaveSlot $slot): array => $this->metadata($slot))->all(),
        ]);
    }

    /** GET — the opaque payload for one slot, plus its metadata. */
    public function show(TowerSaveSlotRouteRequest $request): JsonResponse
    {
        $slot = $this->user($request)
            ->towerSaveSlots()
            ->where('slot', $request->slotKey())
            ->first();

        if ($slot === null || ! $slot->hasPayload()) {
            return response()->json(['message' => 'No cloud save exists for this slot.'], 404);
        }

        return response()->json([
            'data' => [
                ...$this->metadata($slot),
                'payload' => $slot->payload,
            ],
        ]);
    }

    /** PUT — a conditional content write, checked atomically with lease authority. */
    public function store(StoreTowerSaveRequest $request): JsonResponse
    {
        if ($failure = $this->protocolFailure($request, conditional: true)) {
            return $failure;
        }

        return $this->locked($request, function (?TowerSaveSlot $slot) use ($request): JsonResponse {
            if ($slot?->leaseHeldByOther($request->leaseToken())) {
                return $this->conflictResponse($slot);
            }
            if ($failure = $this->revisionFailure($request, $slot)) {
                return $failure;
            }
            $slot ??= new TowerSaveSlot(['user_id' => $this->user($request)->getKey(), 'slot' => $request->slotKey()]);
            $adoptingLease = $slot->lease_token !== $request->leaseToken() || ! $slot->leaseActive();
            $slot->fill([
                'is_deleted' => false, 'payload' => $request->payload(), 'wire_version' => $request->wireVersion(),
                ...$request->displayMetadata(), 'content_revision' => (string) Str::uuid(),
                'lease_token' => $request->leaseToken(), 'lease_expires_at' => now()->addMinutes($this->leaseTtlMinutes()),
            ]);
            if ($adoptingLease || $slot->lease_acquired_at === null) {
                $slot->lease_acquired_at = now();
            }
            $slot->save();

            return response()->json(['data' => $this->metadata($slot, $request->leaseToken())]);
        });
    }

    public function acquire(AcquireTowerLeaseRequest $request): JsonResponse
    {
        if ($failure = $this->protocolFailure($request)) {
            return $failure;
        }

        return $this->locked($request, function (?TowerSaveSlot $slot) use ($request): JsonResponse {
            $requestedToken = $request->leaseToken();
            if ($slot !== null && ! $request->forceTakeover() && $slot->leaseHeldByOther($requestedToken)) {
                return $this->conflictResponse($slot);
            }
            $slot ??= new TowerSaveSlot(['user_id' => $this->user($request)->getKey(), 'slot' => $request->slotKey()]);
            $renewing = $requestedToken !== null && $slot->lease_token === $requestedToken && $slot->leaseActive();
            $token = $renewing ? $requestedToken : Str::random(48);
            if (! $renewing) {
                $slot->lease_acquired_at = now();
            }
            $slot->fill(['lease_token' => $token, 'lease_expires_at' => now()->addMinutes($this->leaseTtlMinutes())])->save();

            return response()->json(['data' => $this->metadata($slot, $token)]);
        });
    }

    public function release(ReleaseTowerLeaseRequest $request): JsonResponse
    {
        if ($failure = $this->protocolFailure($request)) {
            return $failure;
        }

        return $this->locked($request, function (?TowerSaveSlot $slot) use ($request): JsonResponse {
            if ($slot !== null && $slot->lease_token === $request->leaseToken()) {
                $slot->forceFill(['lease_token' => null, 'lease_acquired_at' => null, 'lease_expires_at' => null])->save();
            }

            return response()->json(status: 204);
        });
    }

    /** Owner-authorized deletion retains a tombstone; it does not require the other device's lease. */
    public function destroy(TowerSaveSlotRouteRequest $request): JsonResponse
    {
        if ($failure = $this->protocolFailure($request, conditional: true)) {
            return $failure;
        }

        return $this->locked($request, function (?TowerSaveSlot $slot) use ($request): JsonResponse {
            if ($failure = $this->revisionFailure($request, $slot)) {
                return $failure;
            }
            $slot ??= new TowerSaveSlot(['user_id' => $this->user($request)->getKey(), 'slot' => $request->slotKey()]);
            $slot->forceFill([
                'is_deleted' => true, 'payload' => null, 'wire_version' => null, 'game_day' => null, 'star' => null,
                'population' => null, 'funds' => null, 'lease_token' => null,
                'lease_acquired_at' => null, 'lease_expires_at' => null, 'content_revision' => (string) Str::uuid(),
            ])->save();

            return response()->json(status: 204);
        });
    }

    /** Atomically advance the revision and return its snapshot, fencing earlier ambiguous PUTs. */
    public function restore(TowerSaveSlotRouteRequest $request): JsonResponse
    {
        if ($failure = $this->protocolFailure($request, conditional: true)) {
            return $failure;
        }

        return $this->locked($request, function (?TowerSaveSlot $slot) use ($request): JsonResponse {
            if ($failure = $this->revisionFailure($request, $slot)) {
                return $failure;
            }
            if ($slot === null || ! $slot->hasPayload()) {
                return response()->json(['message' => 'No cloud save exists for this slot.'], 404);
            }
            // Reading/restoring a backup is not permission to take another device's lease.
            $slot->forceFill(['content_revision' => (string) Str::uuid()])->save();

            return response()->json(['data' => [...$this->metadata($slot), 'payload' => $slot->payload]]);
        });
    }

    private function protocolFailure(TowerSaveSlotRouteRequest $request, bool $conditional = false): ?JsonResponse
    {
        if ($request->integer('sync_protocol') !== 2 || ($conditional && ! $request->filled('expected_revision'))) {
            return response()->json(['message' => 'Your tower remains in this browser. Reload the game to update cloud saving.', 'sync_protocol' => 2], 428);
        }

        return null;
    }

    private function revisionFailure(TowerSaveSlotRouteRequest $request, ?TowerSaveSlot $slot): ?JsonResponse
    {
        $currentRevision = $slot === null ? 'absent' : $slot->content_revision;
        if ($request->input('expected_revision') !== $currentRevision) {
            $empty = new TowerSaveSlot(['slot' => $request->slotKey(), 'content_revision' => 'absent']);

            return response()->json(['message' => 'The cloud copy changed. Review it before replacing or deleting it.', 'data' => $this->metadata($slot ?? $empty)], 412);
        }

        return null;
    }

    /**
     * The durable parent row serializes first creation as well as existing slots. On SQLite
     * an explicit no-op write obtains its write lock before any slot read (FOR UPDATE is ignored).
     *
     * @param  callable(?TowerSaveSlot): JsonResponse  $run
     */
    private function locked(TowerSaveSlotRouteRequest $request, callable $run): JsonResponse
    {
        return DB::transaction(function () use ($request, $run): JsonResponse {
            $id = $this->user($request)->getKey();
            if (DB::getDriverName() === 'sqlite') {
                DB::table('users')->where('id', $id)->update(['id' => $id]);
            }
            User::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            $slot = TowerSaveSlot::query()->where('user_id', $id)->where('slot', $request->slotKey())->lockForUpdate()->first();

            return $run($slot);
        }, attempts: 5);
    }

    /**
     * @return array<string, mixed>
     */
    private function metadata(TowerSaveSlot $slot, ?string $token = null): array
    {
        $active = $slot->leaseActive();

        $metadata = [
            'slot' => $slot->slot,
            'content_revision' => $slot->content_revision,
            'saved' => $slot->hasPayload(),
            'deleted' => (bool) $slot->is_deleted,
            'wire_version' => $slot->wire_version,
            'game_day' => $slot->game_day,
            'star' => $slot->star,
            'population' => $slot->population,
            'funds' => $slot->funds,
            'updated_at' => $slot->updated_at?->toIso8601String(),
            'lease_active' => $active,
            'lease_acquired_at' => $active ? $slot->lease_acquired_at?->toIso8601String() : null,
            'lease_expires_at' => $active ? $slot->lease_expires_at?->toIso8601String() : null,
        ];

        if ($token !== null) {
            $metadata['lease_token'] = $token;
        }

        return $metadata;
    }

    private function conflictResponse(TowerSaveSlot $slot): JsonResponse
    {
        return response()->json([
            'message' => 'This save is being used on another device.',
            'conflict' => [
                'acquired_at' => $slot->lease_acquired_at?->toIso8601String(),
                'expires_at' => $slot->lease_expires_at?->toIso8601String(),
            ],
        ], 409);
    }

    private function leaseTtlMinutes(): int
    {
        return (int) config('games.tower.lease_ttl_minutes', 10);
    }

    private function user(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
