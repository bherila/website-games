<?php

namespace Tests\Feature;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\User;
use App\Models\UserGameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameDataIndexApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_can_filter_games_and_omit_active_saves(): void
    {
        $user = User::factory()->create();
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Profile,
            'slot' => 'default',
            'data' => ['version' => 2, 'unlocked_level' => 3],
        ]);
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => ['version' => 2, 'state' => ['level' => 2]],
        ]);
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::Hover,
            'scope' => GameDataScope::Profile,
            'slot' => 'default',
            'data' => ['version' => 1, 'best_score' => 100],
        ]);

        $this->actingAs($user)
            ->getJson('/api/games/data?games[]=marble-sort&include_saves=0')
            ->assertOk()
            ->assertHeader('X-CSRF-TOKEN')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.game', GameSlug::MarbleSort->value)
            ->assertJsonPath('data.0.scope', GameDataScope::Profile->value);
    }

    public function test_index_rejects_unsupported_game_filters(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/games/data?games[]=tower-throwback')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('games.0');
    }

    public function test_math_horde_is_a_supported_game_filter(): void
    {
        $user = User::factory()->create();
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MathHorde,
            'scope' => GameDataScope::Profile,
            'slot' => 'default',
            'data' => ['version' => 1, 'unlocked_level' => 2],
        ]);

        $this->actingAs($user)
            ->getJson('/api/games/data?games[]=math-horde&include_saves=0')
            ->assertOk()
            ->assertJsonPath('data.0.game', GameSlug::MathHorde->value);
    }

    public function test_index_includes_save_tombstones_only_when_saves_are_requested(): void
    {
        $user = User::factory()->create();
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::ParkingPickup,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => [],
            'revision' => 4,
            'is_deleted' => true,
            'writer_id' => '11111111-1111-4111-8111-111111111111',
            'writer_sequence' => 4,
        ]);

        $withSaves = $this->actingAs($user)
            ->getJson('/api/games/data?games[]=parking-pickup&include_saves=1');
        $withSaves->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.scope', GameDataScope::Save->value)
            ->assertJsonPath('data.0.revision', 4)
            ->assertJsonPath('data.0.is_deleted', true);
        $this->assertStringContainsString('"data":{}', (string) $withSaves->getContent());

        $this->actingAs($user)
            ->getJson('/api/games/data?games[]=parking-pickup&include_saves=0')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }
}
