<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TowerDefenseGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_tower_defense_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/tower-defense');

        $response->assertOk()
            ->assertSee('tower-defense-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
