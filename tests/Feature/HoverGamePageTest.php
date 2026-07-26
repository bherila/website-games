<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HoverGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_hover_game_page_is_publicly_accessible(): void
    {
        $this->withoutVite();

        $response = $this->get('/hover');

        $response->assertOk()
            ->assertSee('hover-game-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
