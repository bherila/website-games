<?php

namespace App\Models\Mandarin;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $course_id
 * @property string $content_version
 * @property string $content_hash
 * @property string $status
 * @property bool $native_reviewed
 * @property bool $audio_auditioned
 * @property string $payload
 * @property Carbon $imported_at
 */
class MandarinCourseRevision extends Model
{
    protected $table = 'mandarin_course_revisions';

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'native_reviewed' => 'boolean',
            'audio_auditioned' => 'boolean',
            'imported_at' => 'datetime',
        ];
    }

    /** @return array<string, mixed> */
    public function decoded(): array
    {
        /** @var array<string, mixed> $decoded */
        $decoded = json_decode($this->payload, true, 512, JSON_THROW_ON_ERROR);

        return $decoded;
    }
}
