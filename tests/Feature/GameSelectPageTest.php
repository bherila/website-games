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

    public function test_theme_switcher_offers_all_three_modes_and_defaults_to_system(): void
    {
        $this->withoutVite();

        $response = $this->get('/');

        $response->assertOk()
            ->assertSee('value="system" class="sr-only" checked', false)
            ->assertSee('value="light" class="sr-only"', false)
            ->assertSee('value="dark" class="sr-only"', false);
    }

    public function test_theme_switcher_preselects_the_mode_from_the_theme_cookie(): void
    {
        $this->withoutVite();

        // The cookie is written by client JS, so it arrives unencrypted; this also
        // proves the EncryptCookies exclusion, without which the raw value would be
        // rejected and the control would fall back to "system".
        $response = $this->withUnencryptedCookie('theme', 'dark')->get('/');

        $response->assertOk()
            ->assertSee('value="dark" class="sr-only" checked', false)
            ->assertDontSee('value="system" class="sr-only" checked', false);
    }
}
