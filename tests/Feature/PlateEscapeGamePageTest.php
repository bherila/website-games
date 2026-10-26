<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlateEscapeGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_game_page_is_public(): void
    {
        $this->get('/plate-escape')->assertOk()
            ->assertSee('plate-escape-root')->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }

    public function test_all_released_levels_can_be_saved_and_stars_do_not_regress(): void
    {
        $this->actingAs(User::factory()->create());
        $this->putJson('/api/games/plate-escape/data/level/1', ['data' => ['version' => 1, 'stars' => 3]])->assertSuccessful();
        $this->putJson('/api/games/plate-escape/data/level/1', ['data' => ['version' => 1, 'stars' => 1]])->assertSuccessful();
        $this->getJson('/api/games/data?games[]=plate-escape')->assertSuccessful()
            ->assertJsonFragment(['version' => 1, 'stars' => 3]);
        $this->putJson('/api/games/plate-escape/data/level/2', ['data' => ['version' => 1, 'stars' => 3]])->assertSuccessful()->assertJsonPath('data.slot', '2');
        $this->putJson('/api/games/plate-escape/data/level/2', ['data' => ['version' => 1, 'stars' => 1]])->assertSuccessful()->assertJsonPath('data.data.stars', 3);
        $this->getJson('/api/games/data?games[]=plate-escape')->assertSuccessful()->assertJsonCount(2, 'data');
        foreach ([3, 4, 5, 6, 7, 8, 9, 10] as $level) {
            $this->putJson("/api/games/plate-escape/data/level/{$level}", ['data' => ['version' => 1, 'stars' => 3]])->assertSuccessful();
        }
        $this->getJson('/api/games/data?games[]=plate-escape')->assertSuccessful()->assertJsonCount(10, 'data');
        $this->putJson('/api/games/plate-escape/data/level/11', ['data' => ['version' => 1, 'stars' => 3]])->assertUnprocessable();
        $this->putJson('/api/games/plate-escape/data/save/autosave', ['data' => ['version' => 1]])->assertUnprocessable();
    }
}
