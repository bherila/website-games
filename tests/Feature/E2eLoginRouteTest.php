<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class E2eLoginRouteTest extends TestCase
{
    use RefreshDatabase;

    public function test_route_is_not_registered_outside_the_e2e_environment(): void
    {
        $this->post('/__e2e/login')->assertNotFound();
    }

    public function test_route_hides_itself_when_the_token_is_invalid(): void
    {
        $user = User::factory()->create();
        $this->registerRoute($user);

        $this->post('/__e2e/login')->assertNotFound();
        $this->withHeader('X-E2E-Auth-Token', 'wrong-token')
            ->post('/__e2e/login')
            ->assertNotFound();

        $this->assertGuest();
    }

    public function test_route_authenticates_the_configured_fixture_user(): void
    {
        $user = User::factory()->create();
        $this->registerRoute($user);

        $this->withHeader('X-E2E-Auth-Token', 'test-only-token')
            ->post('/__e2e/login')
            ->assertNoContent();

        $this->assertAuthenticatedAs($user);
    }

    private function registerRoute(User $user): void
    {
        app()->detectEnvironment(fn (): string => 'e2e');
        Config::set('e2e.auth_token', 'test-only-token');
        Config::set('e2e.user_id', $user->getKey());

        Route::middleware('web')->group(base_path('routes/e2e.php'));
    }
}
