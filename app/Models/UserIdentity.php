<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An additional sign-in method on an account, bound to that provider's immutable subject.
 *
 * @property int $user_id
 * @property string $provider
 * @property string $subject
 * @property string|null $email
 */
class UserIdentity extends Model
{
    public const GOOGLE = 'google';

    protected $guarded = [];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
