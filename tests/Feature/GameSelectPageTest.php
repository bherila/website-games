<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameSelectPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_game_select_page_is_publicly_accessible(): void
    {
        $this->withoutVite();

        $response = $this->get('/');

        // The select page uses the bare game shell layout (no navbar), like every
        // other game page.
        $response->assertOk()
            ->assertSee('game-select-root')
            ->assertDontSee('id="navbar"', false);
    }
}
