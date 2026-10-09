<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Services\Admin\ApplicationAdministrators;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    /**
     * Whether this account is an application administrator.
     *
     * Read-only on purpose: `is_admin` is not mass assignable, and grants and revocations go
     * through {@see ApplicationAdministrators}, which owns the last-administrator rule and the
     * log trail.
     */
    public function isAdministrator(): bool
    {
        return $this->is_admin === true;
    }

    /**
     * @return HasMany<UserGameData, $this>
     */
    public function gameData(): HasMany
    {
        return $this->hasMany(UserGameData::class);
    }

    /**
     * @return HasMany<TowerSaveSlot, $this>
     */
    public function towerSaveSlots(): HasMany
    {
        return $this->hasMany(TowerSaveSlot::class);
    }
}
