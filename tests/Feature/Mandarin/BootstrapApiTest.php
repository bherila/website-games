<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;

class BootstrapApiTest extends MandarinTestCase
{
    public function test_bootstrap_is_503_without_a_published_course(): void
    {
        $this->getJson('/api/games/mandarin/bootstrap')->assertStatus(503);
    }

    public function test_guest_bootstrap_is_read_only_and_no_store(): void
    {
        $this->importCourse();
        $response = $this->getJson('/api/games/mandarin/bootstrap');
        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('runtime', 'live')
            ->assertJsonPath('account.signedIn', false)
            ->assertJsonPath('capabilities.canGenerateAudio', false)
            ->assertJsonPath('capabilities.canSaveToAccount', false)
            ->assertJsonPath('capabilities.hasDistinctMandarinVoices', false)
            ->assertJsonPath('course.courseId', 'mandarin-foundations')
            ->assertJsonCount(100, 'course.utterances');
        $this->assertSame(0, MandarinAudioAsset::query()->count(), 'bootstrap must never enqueue generation');
    }

    public function test_signed_in_bootstrap_reports_generation_capability_from_config(): void
    {
        $this->importCourse();
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/games/mandarin/bootstrap')
            ->assertOk()
            ->assertJsonPath('account.signedIn', true)
            ->assertJsonPath('account.accountPartitionId', 'user:'.$user->id)
            ->assertJsonPath('capabilities.canGenerateAudio', true)
            ->assertJsonPath('capabilities.canSaveToAccount', true);

        config()->set('mandarin.speech.generation_enabled', false);
        $this->actingAs($user)->getJson('/api/games/mandarin/bootstrap')->assertJsonPath('capabilities.canGenerateAudio', false);
    }

    public function test_progress_and_events_require_authentication(): void
    {
        $this->importCourse();
        $this->getJson('/api/games/mandarin/progress')->assertStatus(401);
        $this->postJson('/api/games/mandarin/events', ['events' => []])->assertStatus(401);
    }

    public function test_page_shell_carries_the_configured_runtime(): void
    {
        $this->withoutVite();
        $this->get('/mandarin')->assertOk()->assertSee('data-runtime="live"', false);
        config()->set('mandarin.runtime', 'preview');
        $this->get('/mandarin')->assertOk()->assertSee('data-runtime="preview"', false);
        config()->set('mandarin.runtime', 'mocks-please');
        $this->get('/mandarin')->assertOk()->assertSee('data-runtime="live"', false);
        $this->get('/mandarin/preview')->assertOk()->assertSee('data-runtime="preview"', false);
    }

    public function test_preview_route_is_hidden_in_production(): void
    {
        $this->withoutVite();
        $this->app->detectEnvironment(fn (): string => 'production');
        $this->get('/mandarin/preview')->assertNotFound();
        $this->get('/mandarin')->assertOk();
    }
}
