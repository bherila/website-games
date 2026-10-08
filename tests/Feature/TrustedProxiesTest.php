<?php

namespace Tests\Feature;

use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The client address behind the CDN, and only behind it.
 *
 * Untrusted, every caller looks like an edge address and shares one rate-limit
 * budget; trusted too broadly, a direct connection to the origin could forge
 * its address. The default deployment trusts Cloudflare's published ranges.
 */
final class TrustedProxiesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Route::get('/_test/whoami', static fn (Request $request) => response()->json([
            'ip' => $request->ip(),
            'secure' => $request->isSecure(),
            'port' => $request->getPort(),
        ]));
        Route::post('/_test/limited', static fn () => response()->json(['ok' => true]))->middleware('throttle:2,1');
    }

    protected function tearDown(): void
    {
        TrustProxies::flushState();
        parent::tearDown();
    }

    public function test_the_address_cloudflare_appended_is_the_client(): void
    {
        $this->withServerVariables([
            'REMOTE_ADDR' => '172.64.9.9',
            'HTTP_X_FORWARDED_FOR' => '192.0.2.1, 198.51.100.7',
            'HTTP_X_FORWARDED_PROTO' => 'https',
        ])->getJson('/_test/whoami')
            ->assertOk()
            ->assertJsonPath('ip', '198.51.100.7')
            ->assertJsonPath('secure', true);
    }

    public function test_a_direct_connection_cannot_spoof_its_address_scheme_or_port(): void
    {
        $this->withServerVariables([
            'REMOTE_ADDR' => '203.0.113.5',
            'SERVER_PORT' => '80',
            'HTTP_X_FORWARDED_FOR' => '198.51.100.7',
            'HTTP_CF_CONNECTING_IP' => '198.51.100.7',
            'HTTP_X_FORWARDED_PROTO' => 'https',
            'HTTP_X_FORWARDED_PORT' => '8443',
        ])->getJson('/_test/whoami')
            ->assertOk()
            ->assertJsonPath('ip', '203.0.113.5')
            ->assertJsonPath('secure', false)
            ->assertJsonPath('port', 80);
    }

    public function test_clients_behind_one_edge_have_separate_throttle_budgets(): void
    {
        $from = fn (string $client) => $this->withServerVariables(['REMOTE_ADDR' => '104.16.1.2', 'HTTP_X_FORWARDED_FOR' => $client]);

        $from('198.51.100.7')->postJson('/_test/limited')->assertOk();
        $from('198.51.100.7')->postJson('/_test/limited')->assertOk();
        $from('198.51.100.7')->postJson('/_test/limited')->assertTooManyRequests();
        $from('198.51.100.8')->postJson('/_test/limited')->assertOk();
    }
}
