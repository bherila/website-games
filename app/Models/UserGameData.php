<?php

namespace App\Models;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\UserGameDataFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property GameSlug $game
 * @property GameDataScope $scope
 * @property string $slot
 * @property array<string, mixed> $data
 * @property int $revision
 * @property bool $is_deleted
 * @property string|null $writer_id
 * @property int|null $writer_sequence
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class UserGameData extends Model
{
    /** @use HasFactory<UserGameDataFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'game',
        'scope',
        'slot',
        'data',
        'revision',
        'is_deleted',
        'writer_id',
        'writer_sequence',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'game' => GameSlug::class,
            'scope' => GameDataScope::class,
            'data' => 'array',
            'revision' => 'integer',
            'is_deleted' => 'boolean',
            'writer_sequence' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
