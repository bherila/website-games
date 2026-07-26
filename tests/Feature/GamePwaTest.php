<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class GamePwaTest extends TestCase
{
    public function test_manifest_keeps_the_start_url_inside_the_games_scope(): void
    {
        $contents = file_get_contents(public_path('manifest.webmanifest'));
        $this->assertIsString($contents);

        /** @var array{name: string, scope: string, start_url: string, icons: list<mixed>, shortcuts: list<mixed>} $manifest */
        $manifest = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame('BWH Games', $manifest['name']);
        $this->assertSame('/games', $manifest['scope']);
        $this->assertSame('/games', $manifest['start_url']);
        $this->assertCount(4, $manifest['icons']);
        $this->assertCount(8, $manifest['shortcuts']);
    }

    public function test_games_hub_registers_the_manifest_and_service_worker_entry(): void
    {
        $response = $this->get('/games');

        $response->assertOk()
            ->assertSee('rel="manifest" href="/manifest.webmanifest"', false)
            ->assertSee('rel="apple-touch-icon" href="/pwa/icon-192.png"', false);
    }

    public function test_game_page_registers_the_manifest_and_service_worker_entry(): void
    {
        $response = $this->get('/games/tower-throwback');

        $response->assertOk()
            ->assertSee('rel="manifest" href="/manifest.webmanifest"', false)
            ->assertSee('rel="apple-touch-icon" href="/pwa/icon-192.png"', false);
    }

    public function test_root_redirects_to_the_games_hub(): void
    {
        // Unlike the monorepo this was extracted from, every page in this standalone
        // app is a games page — there is no non-game page left to assert against, so
        // '/' just redirects into the games hub rather than rendering its own shell.
        $response = $this->get('/');

        $response->assertRedirect(route('games.index'));
    }

    public function test_service_worker_route_sets_the_games_scope_header(): void
    {
        $serviceWorkerPath = public_path('build/sw.js');
        $createdServiceWorkerFixture = ! File::exists($serviceWorkerPath);

        if ($createdServiceWorkerFixture) {
            File::ensureDirectoryExists(dirname($serviceWorkerPath));
            File::put($serviceWorkerPath, 'self.addEventListener("fetch", () => {});');
        }

        try {
            $response = $this->get('/sw.js');

            $response->assertOk()
                ->assertHeader('Content-Type', 'application/javascript; charset=utf-8')
                ->assertHeader('Service-Worker-Allowed', '/games');

            $cacheControl = $response->headers->get('Cache-Control');
            $this->assertIsString($cacheControl);
            $this->assertStringContainsString('no-cache', $cacheControl);
            $this->assertStringContainsString('no-store', $cacheControl);
            $this->assertStringContainsString('must-revalidate', $cacheControl);
        } finally {
            if ($createdServiceWorkerFixture) {
                File::delete($serviceWorkerPath);
            }
        }
    }
}
