<?php

namespace App\Models\Mandarin;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $recipe_hash
 * @property string $provider
 * @property string $kind
 * @property string $state
 * @property string $recipe
 * @property int $text_length
 * @property int $attempts
 * @property string|null $lease_token
 * @property Carbon|null $lease_expires_at
 * @property string|null $disk
 * @property string|null $object_key
 * @property string|null $content_hash
 * @property string|null $content_type
 * @property int|null $bytes
 * @property int|null $duration_ms
 * @property string|null $error_code
 * @property string|null $error_message
 * @property string|null $provider_metadata
 * @property Carbon|null $ready_at
 */
class MandarinAudioAsset extends Model
{
    public const STATE_QUEUED = 'queued';

    public const STATE_GENERATING = 'generating';

    public const STATE_READY = 'ready';

    public const STATE_FAILED = 'failed';

    protected $table = 'mandarin_audio_assets';

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'lease_expires_at' => 'datetime',
            'ready_at' => 'datetime',
        ];
    }

    public function isReady(): bool
    {
        return $this->state === self::STATE_READY && $this->disk !== null && $this->object_key !== null;
    }

    /** @return array<string, mixed> */
    public function recipeArray(): array
    {
        /** @var array<string, mixed> $decoded */
        $decoded = json_decode($this->recipe, true, 512, JSON_THROW_ON_ERROR);

        return $decoded;
    }
}
