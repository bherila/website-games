<?php

namespace Database\Factories;

use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TowerSaveSlot>
 */
class TowerSaveSlotFactory extends Factory
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
            'slot' => 'slot-a',
            'payload' => ['version' => 2, 'mapId' => 'city-tower'],
            'wire_version' => 2,
            'game_day' => $this->faker->numberBetween(1, 90),
            'star' => $this->faker->numberBetween(1, 5),
            'population' => $this->faker->numberBetween(0, 5_000),
            'funds' => $this->faker->numberBetween(-50_000, 5_000_000),
            'lease_token' => null,
            'lease_acquired_at' => null,
            'lease_expires_at' => null,
        ];
    }

    /** A slot holding an active (unexpired) lease for the given token. */
    public function leasedTo(string $token, int $ttlMinutes = 10): self
    {
        return $this->state(fn (): array => [
            'lease_token' => $token,
            'lease_acquired_at' => now(),
            'lease_expires_at' => now()->addMinutes($ttlMinutes),
        ]);
    }

    /** A slot whose lease has already expired. */
    public function leaseExpired(string $token = 'expired-token'): self
    {
        return $this->state(fn (): array => [
            'lease_token' => $token,
            'lease_acquired_at' => now()->subHour(),
            'lease_expires_at' => now()->subMinutes(5),
        ]);
    }
}
