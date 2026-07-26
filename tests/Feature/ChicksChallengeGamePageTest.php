<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChicksChallengeGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_chicks_challenge_game_page_is_publicly_accessible(): void
    {
        $this->withoutVite();

        $response = $this->get('/games/chicks-challenge');

        $response->assertOk()
            ->assertSee('chicks-game-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }

    /**
     * The HUD, toolbar and D-pad pad themselves with env(safe-area-inset-*), which
     * only resolves to a non-zero inset when the viewport meta opts into
     * viewport-fit=cover.
     */
    public function test_chicks_challenge_game_page_opts_into_the_safe_area_viewport(): void
    {
        $this->withoutVite();

        $response = $this->get('/games/chicks-challenge');

        $response->assertOk()
            ->assertSee('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', false);
    }

    /** Games that do not pad for the safe area must keep the plain viewport meta. */
    public function test_other_game_pages_keep_the_default_viewport(): void
    {
        $this->withoutVite();

        $response = $this->get('/games/hover');

        $response->assertOk()
            ->assertSee('<meta name="viewport" content="width=device-width, initial-scale=1">', false);
    }
}
