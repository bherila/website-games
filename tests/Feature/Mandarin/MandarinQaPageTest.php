<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioAssetService;

class MandarinQaPageTest extends MandarinTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->importCourse();
    }

    public function test_the_page_is_not_public(): void
    {
        // Auth middleware, so a guest is bounced to sign-in rather than served the sheet.
        $this->get('/mandarin/qa')->assertStatus(302)->assertRedirect(route('login'));
        $this->getJson('/mandarin/qa')->assertStatus(302);
    }

    public function test_a_signed_in_user_sees_every_line_with_its_provenance(): void
    {
        $response = $this->actingAs(User::factory()->create())->get('/mandarin/qa')->assertOk();

        $response->assertSee('你好。', false)
            ->assertSee('Nǐ hǎo.', false)
            ->assertSee('Hello.')
            ->assertSee('Scene 1 — At the gate')
            ->assertSee('Guide')
            // Targets are listed as well as utterances.
            ->assertSee('Targets')
            ->assertSee('Supporting glossary')
            ->assertSee('Context words that can be heard and practised but never become scheduled mastery cards.')
            // Provider id from the bound synthesizer, and honest provenance.
            ->assertSee('fake')
            ->assertSee('Not native-reviewed')
            ->assertSee('Audio not auditioned');

        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_reserved_checkpoint_lines_are_labelled(): void
    {
        $response = $this->actingAs(User::factory()->create())->get('/mandarin/qa')->assertOk();

        $response->assertSee('Reserved for the listening check')
            ->assertSee('我是他的朋友。', false);
    }

    public function test_a_line_without_audio_reports_its_state_and_the_page_never_generates(): void
    {
        // Read-only resolution: even for a signed-in user, nothing is enqueued.
        $this->actingAs(User::factory()->create())->get('/mandarin/qa')->assertOk()
            ->assertSee('unavailable: generation_disabled')
            ->assertDontSee('<audio', false);

        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }

    public function test_a_generated_line_gets_a_playable_audio_element(): void
    {
        $user = User::factory()->create();
        $requestId = (int) $this->actingAs($user)->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', [
                'courseId' => 'mandarin-foundations',
                'contentVersion' => '1.0.1',
                'sources' => [['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal']],
            ])->assertStatus(202)->json('results.0.requestId');
        $this->app->make(AudioAssetService::class)->generate($requestId);
        $asset = MandarinAudioAsset::query()->findOrFail($requestId);
        $this->assertSame('ready', $asset->state);

        $response = $this->actingAs($user)->get('/mandarin/qa')->assertOk();

        $response->assertSee('<audio controls preload="none"', false)
            ->assertSee("/media/games/mandarin/{$requestId}/{$asset->content_hash}.mp3", false)
            // The asset row's provenance is shown next to the player.
            ->assertSee('fake')
            ->assertSee('Narrator');
    }

    public function test_production_hides_the_page_unless_it_is_explicitly_enabled(): void
    {
        $user = User::factory()->create();
        $this->app->detectEnvironment(fn () => 'production');

        $this->actingAs($user)->get('/mandarin/qa')->assertNotFound();

        config()->set('mandarin.qa_enabled', true);
        $this->actingAs($user)->get('/mandarin/qa')->assertOk();
    }
}
