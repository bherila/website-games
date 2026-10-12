<?php

namespace Tests\Feature\Mandarin;

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Tests\TestCase;

/**
 * Pins the full definition of every Mandarin route (method, URI, name, middleware and
 * constraints) so moving the registration between files cannot change behaviour.
 */
class MandarinRoutesTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string, 2: list<string>, 3: array<string, string>}> */
    public static function expectedRoutes(): array
    {
        return [
            'games.mandarin' => ['GET', '/mandarin', ['web'], []],
            'games.mandarin.preview' => ['GET', '/mandarin/preview', ['web'], []],
            'games.mandarin.qa' => ['GET', '/mandarin/qa', ['web', 'auth'], []],
            'games.mandarin.media' => ['GET', '/media/games/mandarin/{asset}/{hash}.{extension}', ['web'], [
                'asset' => '[0-9]+',
                'hash' => '[a-f0-9]{64}',
                'extension' => '(mp3|m4a|wav)',
            ]],
            'games.mandarin.bootstrap' => ['GET', '/api/games/mandarin/bootstrap', ['api', 'web', 'throttle:120,1'], []],
            'games.mandarin.audio.resolve' => ['POST', '/api/games/mandarin/audio/resolve', ['api', 'web', 'throttle:120,1'], []],
            'games.mandarin.audio.poll' => ['GET', '/api/games/mandarin/audio/requests/{request}', ['api', 'web', 'throttle:120,1'], ['request' => '[0-9]+']],
            'games.mandarin.progress' => ['GET', '/api/games/mandarin/progress', ['api', 'web', 'auth', 'throttle:120,1'], []],
            'games.mandarin.events' => ['POST', '/api/games/mandarin/events', ['api', 'web', 'auth', 'throttle:120,1'], []],
            'admin.mandarin.audio.request' => ['POST', '/api/admin/mandarin/audio/request', ['api', 'web', 'auth', 'can:administer', 'throttle:30,1,admin-audio-actions'], []],
            'admin.mandarin.audio.regenerate' => ['POST', '/api/admin/mandarin/audio/regenerate', ['api', 'web', 'auth', 'can:administer', 'throttle:30,1,admin-audio-actions'], []],
            'admin.mandarin.audio.request-missing' => ['POST', '/api/admin/mandarin/audio/request-missing', ['api', 'web', 'auth', 'can:administer', 'throttle:30,1,admin-audio-actions'], []],
            'admin.mandarin.audio.retry-failed' => ['POST', '/api/admin/mandarin/audio/retry-failed', ['api', 'web', 'auth', 'can:administer', 'throttle:30,1,admin-audio-actions'], []],
            'admin.mandarin.audio' => ['GET', '/api/admin/mandarin/audio', ['api', 'web', 'auth', 'can:administer', 'throttle:120,1,admin-audio-list'], []],
        ];
    }

    public function test_every_mandarin_route_keeps_its_definition(): void
    {
        $actual = [];
        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            /** @var Route $route */
            $name = $route->getName();
            if ($name !== null && (str_contains($name, 'mandarin'))) {
                $actual[$name] = [
                    $route->methods()[0],
                    '/'.ltrim($route->uri(), '/'),
                    array_values(array_map('strval', $route->gatherMiddleware())),
                    $route->wheres,
                ];
            }
        }

        ksort($actual);
        $expected = self::expectedRoutes();
        ksort($expected);

        $this->assertSame($expected, $actual);
    }

    public function test_mandarin_routes_live_in_their_own_file(): void
    {
        foreach (['routes/web.php', 'routes/api.php'] as $file) {
            $this->assertDoesNotMatchRegularExpression('/mandarin/i', (string) file_get_contents(base_path($file)), $file);
        }
    }
}
