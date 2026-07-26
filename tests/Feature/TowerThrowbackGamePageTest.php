<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TowerThrowbackGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_tower_throwback_game_page_is_publicly_accessible(): void
    {
        $this->withoutVite();

        $response = $this->get('/tower-throwback');

        $response->assertOk()
            ->assertSee('tower-game-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
