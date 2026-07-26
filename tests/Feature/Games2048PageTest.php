<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Games2048PageTest extends TestCase
{
    use RefreshDatabase;

    public function test_2048_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/games/2048');

        $response->assertOk()
            ->assertSee('game-2048-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
