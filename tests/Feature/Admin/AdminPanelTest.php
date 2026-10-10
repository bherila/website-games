<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Mandarin\MandarinTestCase;

/** The admin panel page: who may open it, what it links to, and who sees the link to it. */
class AdminPanelTest extends MandarinTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->importCourse();
    }

    public function test_guests_are_sent_to_sign_in(): void
    {
        $this->get('/admin')->assertRedirect(route('login'));
    }

    public function test_a_signed_in_account_that_is_not_an_administrator_gets_403(): void
    {
        $this->actingAs(User::factory()->create())->get('/admin')->assertForbidden();
    }

    public function test_an_administrator_gets_the_page_with_the_qa_link_and_the_endpoints(): void
    {
        $response = $this->actingAs($this->admin())->get('/admin')->assertOk();

        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $panel = $this->panel($response);
        $this->assertSame(route('games.mandarin.qa'), $panel['qaUrl']);
        $this->assertTrue($panel['qaAvailable']);
        $this->assertSame(route('admin.mandarin.audio.request-missing'), $panel['audio']['requestMissing']);
    }

    public function test_the_users_link_is_built_from_config_and_hidden_when_unconfigured(): void
    {
        config()->set('bherila-auth.oauth_client.base_url', 'https://identity.example.test/');
        config()->set('bherila-auth.delegated_access.application', 'games app/1');
        $this->assertSame(
            'https://identity.example.test/applications/games%20app%2F1/access',
            $this->panel($this->actingAs($this->admin())->get('/admin'))['usersUrl'],
        );

        config()->set('bherila-auth.delegated_access.application', '');
        $this->assertNull($this->panel($this->actingAs($this->admin())->get('/admin'))['usersUrl']);

        config()->set('bherila-auth.delegated_access.application', 'games');
        config()->set('bherila-auth.oauth_client.base_url', '');
        $this->assertNull($this->panel($this->actingAs($this->admin())->get('/admin'))['usersUrl']);
    }

    public function test_only_administrators_see_the_admin_link_on_the_games_page(): void
    {
        $this->get('/')->assertOk()->assertDontSee('data-testid="admin-link"', false);
        $this->actingAs(User::factory()->create())->get('/')->assertOk()->assertDontSee('data-testid="admin-link"', false);
        $this->actingAs($this->admin())->get('/')->assertOk()->assertSee('data-testid="admin-link"', false)->assertSee(route('admin.index'), false);
    }

    private function admin(): User
    {
        return User::factory()->administrator()->create();
    }

    /** @return array<string, mixed> */
    private function panel(TestResponse $response): array
    {
        $this->assertSame(1, preg_match('#<script id="admin-panel-data" type="application/json">(.*?)</script>#s', (string) $response->getContent(), $match));

        return json_decode($match[1], true, 512, JSON_THROW_ON_ERROR);
    }
}
