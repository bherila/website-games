<?php

namespace App\Models\Mandarin;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property string $client_event_id
 * @property int $sequence
 * @property string $course_id
 * @property string $content_version
 * @property string $kind
 * @property string $mode
 * @property string|null $opportunity_id
 * @property string|null $scene_id
 * @property string|null $node_id
 * @property string|null $exercise_id
 * @property string|null $target_id
 * @property string|null $correctness
 * @property string|null $grade
 * @property bool $schedule_eligible
 * @property string $payload_hash
 * @property string $payload
 * @property Carbon|null $client_occurred_at
 * @property Carbon $accepted_at
 */
class MandarinPracticeEvent extends Model
{
    public $timestamps = false;

    protected $table = 'mandarin_practice_events';

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'schedule_eligible' => 'boolean',
            'client_occurred_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }
}
