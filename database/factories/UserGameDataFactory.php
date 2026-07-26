<?php

namespace Database\Factories;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\User;
use App\Models\UserGameData;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UserGameData>
 */
class UserGameDataFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'game' => GameSlug::ChicksChallenge,
            'scope' => GameDataScope::Profile,
            'slot' => 'default',
            'data' => [
                'unlocked_level' => 1,
            ],
            'is_deleted' => false,
        ];
    }
}
