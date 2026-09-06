<?php

namespace App\Models\Mandarin;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $course_id
 * @property string $content_version
 * @property string $source_kind
 * @property string $source_id
 * @property string $variant
 * @property string $recipe_hash
 */
class MandarinAudioSource extends Model
{
    protected $table = 'mandarin_audio_sources';

    protected $guarded = [];
}
