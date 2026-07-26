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

    /** PUT — lease-checked write of a save payload to a slot. */
    public function store(StoreTowerSaveRequest $request): JsonResponse
    {
        $token = $request->leaseToken();
        $slot = $this->user($request)
            ->towerSaveSlots()
            ->firstOrNew(['slot' => $request->slotKey()]);

        if ($slot->leaseHeldByOther($token)) {
            return $this->conflictResponse($slot);
        }

        $adoptingLease = $slot->lease_token !== $token || ! $slot->leaseActive();

        $slot->fill([
            'payload' => $request->payload(),
            'wire_version' => $request->wireVersion(),
            ...$request->displayMetadata(),
            'lease_token' => $token,
            'lease_expires_at' => now()->addMinutes($this->leaseTtlMinutes()),
        ]);
        if ($adoptingLease || $slot->lease_acquired_at === null) {
            $slot->lease_acquired_at = now();
        }
        $slot->save();

        return response()->json(['data' => $this->metadata($slot, $token)]);
    }

    /** POST — acquire a fresh lease, or take one over with `force`. */
    public function acquire(AcquireTowerLeaseRequest $request): JsonResponse
    {
        $requestedToken = $request->leaseToken();
        $slot = $this->user($request)
            ->towerSaveSlots()
            ->firstOrNew(['slot' => $request->slotKey()]);

        if (! $request->forceTakeover() && $slot->leaseHeldByOther($requestedToken)) {
            return $this->conflictResponse($slot);
        }

        $renewingOwnLease = $requestedToken !== null
            && $slot->lease_token === $requestedToken
            && $slot->leaseActive();

        $issuedToken = $renewingOwnLease ? $requestedToken : Str::random(48);
        if (! $renewingOwnLease) {
            $slot->lease_acquired_at = now();
        }
        $slot->lease_token = $issuedToken;
        $slot->lease_expires_at = now()->addMinutes($this->leaseTtlMinutes());
        $slot->save();

        return response()->json(['data' => $this->metadata($slot, $issuedToken)]);
    }

    /** DELETE — release a lease this client holds (idempotent). */
    public function release(ReleaseTowerLeaseRequest $request): JsonResponse
    {
        $slot = $this->user($request)
            ->towerSaveSlots()
            ->where('slot', $request->slotKey())
            ->first();

        if ($slot !== null && $slot->lease_token === $request->leaseToken()) {
            $slot->forceFill([
                'lease_token' => null,
                'lease_acquired_at' => null,
                'lease_expires_at' => null,
            ])->save();
        }

        return response()->json(status: 204);
    }

    /** DELETE — remove the whole slot (payload + lease). */
    public function destroy(TowerSaveSlotRouteRequest $request): JsonResponse
    {
        $this->user($request)
            ->towerSaveSlots()
            ->where('slot', $request->slotKey())
            ->delete();

        return response()->json(status: 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function metadata(TowerSaveSlot $slot, ?string $token = null): array
    {
        $active = $slot->leaseActive();

        $metadata = [
            'slot' => $slot->slot,
            'saved' => $slot->hasPayload(),
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
