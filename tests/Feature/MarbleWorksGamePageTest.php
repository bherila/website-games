<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MarbleWorksGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_marble_works_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/marble-works');

        $response->assertOk()
            ->assertSee('marble-works-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
