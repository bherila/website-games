<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MandarinGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_mandarin_game_page_is_publicly_accessible(): void
    {
        $this->withoutVite();

        $response = $this->get('/mandarin');

        $response->assertOk()
            ->assertSee('mandarin-game-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }

    /** The shell pads with env(safe-area-inset-*), which needs viewport-fit=cover. */
    public function test_mandarin_game_page_opts_into_the_safe_area_viewport(): void
    {
        $this->withoutVite();

        $response = $this->get('/mandarin');

        $response->assertOk()
            ->assertSee('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', false);
    }

    /** Every slot in the visual manifest must ship a real, text-free fallback image. */
    public function test_every_visual_slot_has_a_fallback_image(): void
    {
        $manifest = json_decode((string) file_get_contents(resource_path('data/mandarin/visual-assets.v1.json')), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($manifest['assets'] ?? null);

        foreach ($manifest['assets'] as $asset) {
            $path = public_path("images/games/mandarin/fallback/{$asset['id']}.svg");
            $this->assertFileExists($path);
            $this->assertStringNotContainsStringIgnoringCase('<text', (string) file_get_contents($path));
        }
    }

    public function test_mandarin_route_is_named(): void
    {
        $this->assertSame(url('/mandarin'), route('games.mandarin'));
    }

    /** The preview shell must not ship any live API; the shared game-data routes stay untouched. */
    public function test_no_mandarin_api_routes_exist_in_this_phase(): void
    {
        $this->withoutVite();

        $this->get('/api/games/mandarin/bootstrap')->assertNotFound();
        $this->postJson('/api/games/mandarin/events', [])->assertNotFound();
    }
}
