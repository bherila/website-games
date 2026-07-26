<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\TowerSaveSlotFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One Tower Throwback cloud save slot for a single user. The payload is an
 * opaque, client-versioned JSON blob; the server only stores it and mirrors
 * a small set of display metadata alongside an optional ownership lease.
 *
 * @property int $id
 * @property int $user_id
 * @property string $slot
 * @property array<string, mixed>|null $payload
 * @property int|null $wire_version
 * @property int|null $game_day
 * @property int|null $star
 * @property int|null $population
 * @property int|null $funds
 * @property string|null $lease_token
 * @property Carbon|null $lease_acquired_at
 * @property Carbon|null $lease_expires_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class TowerSaveSlot extends Model
{
    /** @use HasFactory<TowerSaveSlotFactory> */
    use HasFactory, SerializesDatesAsLocal;

    /**
     * The bounded set of slot keys, mirroring the client's local slot ids
     * (`SANDBOX_SLOT_IDS` in `gameProgress`/`gameTypes`).
     *
     * @var list<string>
     */
    public const SLOT_KEYS = ['autosave', 'slot-a', 'slot-b', 'slot-c'];

    /**
     * Save wire-contract versions this backend accepts. A payload whose version
     * is newer than anything the frontend can migrate is rejected so an
     * out-of-date client never clobbers a slot with data it cannot read back.
     *
     * @var list<int>
     */
    public const SUPPORTED_WIRE_VERSIONS = [1, 2];

    protected $fillable = [
        'user_id',
        'slot',
        'payload',
        'wire_version',
        'game_day',
        'star',
        'population',
        'funds',
        'lease_token',
        'lease_acquired_at',
        'lease_expires_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'wire_version' => 'integer',
            'game_day' => 'integer',
            'star' => 'integer',
            'population' => 'integer',
            'funds' => 'integer',
            'lease_acquired_at' => 'datetime',
            'lease_expires_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Whether an unexpired lease is currently held on this slot. */
    public function leaseActive(): bool
    {
        return $this->lease_token !== null
            && $this->lease_expires_at !== null
            && $this->lease_expires_at->isFuture();
    }

    /** Whether an unexpired lease is held by a token other than the one given. */
    public function leaseHeldByOther(?string $token): bool
    {
        return $this->leaseActive() && $this->lease_token !== $token;
    }

    /** Whether this slot currently holds a persisted save payload. */
    public function hasPayload(): bool
    {
        return $this->payload !== null;
    }
}
