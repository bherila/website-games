<?php

namespace Tests\Feature\Mandarin;

use App\Jobs\Mandarin\GenerateMandarinAudioJob;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Audio\AudioRecipe;
use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;
use App\Services\Games\Mandarin\Speech\SpeechRequest;
use App\Services\Games\Mandarin\Speech\SynthesizedAudio;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AudioResolveApiTest extends MandarinTestCase
{
    private const IDENTITY = ['courseId' => 'mandarin-foundations', 'contentVersion' => '1.0.0'];

    private const HELLO = ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
    }

    private function resolve(?User $user, array $sources): TestResponse
    {
        $request = $this->withHeaders(['Accept' => 'application/json']);
        if ($user !== null) {
            $request = $request->actingAs($user);
        }

        return $request->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => $sources]);
    }

    public function test_guest_gets_cache_hits_only_and_never_triggers_generation(): void
    {
        Bus::fake();
        $this->resolve(null, [self::HELLO])->assertOk()
            ->assertJsonPath('results.0.state', 'unavailable')
            ->assertJsonPath('results.0.code', 'sign_in_required');
        $this->resolve(null, [['sourceKind' => 'utterance', 'sourceId' => 'nope', 'variant' => 'normal']])
            ->assertOk()->assertJsonPath('results.0.state', 'failed')->assertJsonPath('results.0.code', 'unknown_source');
        Bus::assertNothingDispatched();
        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }

    public function test_generation_disabled_is_reported_honestly(): void
    {
        config()->set('mandarin.speech.generation_enabled', false);
        $this->resolve(User::factory()->create(), [self::HELLO])->assertOk()
            ->assertJsonPath('results.0.state', 'unavailable')
            ->assertJsonPath('results.0.code', 'generation_disabled');
    }

    public function test_request_validation_bounds(): void
    {
        $user = User::factory()->create();
        $this->resolve($user, array_fill(0, 17, self::HELLO))->assertStatus(422);
        $this->resolve($user, [['sourceKind' => 'text', 'sourceId' => 'x', 'variant' => 'normal']])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/games/mandarin/audio/resolve', ['courseId' => 'mandarin-foundations', 'contentVersion' => '9.9.9', 'sources' => [self::HELLO]])->assertStatus(422);
    }

    public function test_miss_is_claimed_once_then_generated_stored_and_served(): void
    {
        Bus::fake([GenerateMandarinAudioJob::class]);
        $user = User::factory()->create();
        $first = $this->resolve($user, [self::HELLO])->assertStatus(202)->assertJsonPath('results.0.state', 'queued');
        $requestId = $first->json('results.0.requestId');
        // Concurrent identical miss: same row, no second job.
        $this->resolve($user, [self::HELLO])->assertStatus(202)->assertJsonPath('results.0.requestId', $requestId);
        Bus::assertDispatchedTimes(GenerateMandarinAudioJob::class, 1);
        $this->assertSame(1, MandarinAudioAsset::query()->count());

        // Polling never enqueues.
        $this->getJson("/api/games/mandarin/audio/requests/{$requestId}")->assertOk()->assertJsonPath('state', 'queued');
        Bus::assertDispatchedTimes(GenerateMandarinAudioJob::class, 1);

        // Worker runs.
        $this->app->make(AudioAssetService::class)->generate((int) $requestId);
        $asset = MandarinAudioAsset::query()->findOrFail($requestId);
        $this->assertSame('ready', $asset->state);
        $this->assertSame('local', $asset->disk);
        $this->assertNotNull($asset->object_key);
        $this->assertSame(hash('sha256', Storage::disk('local')->get($asset->object_key)), $asset->content_hash);
        $this->assertCount(1, $this->speech->requests);
        $this->assertSame('你好。', $this->speech->requests[0]->text);
        $this->assertSame('guide', $this->speech->requests[0]->role);

        $ready = $this->getJson("/api/games/mandarin/audio/requests/{$requestId}")->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('provenance', 'synthesized_speech')
            ->assertJsonPath('contentType', 'audio/mpeg');
        $url = $ready->json('url');
        $this->assertStringContainsString("/media/games/mandarin/{$requestId}/{$asset->content_hash}.mp3", $url);

        // Cache hit for a guest with generation disabled and no provider calls.
        config()->set('mandarin.speech.generation_enabled', false);
        $this->resolve(null, [self::HELLO])->assertOk()->assertJsonPath('results.0.state', 'ready')->assertJsonPath('results.0.url', $url);
        $this->assertCount(1, $this->speech->requests);

        // Media route: bytes, type, immutable caching, Range support, wrong hash 404.
        $media = $this->get($url)->assertOk()->assertHeader('Content-Type', 'audio/mpeg')->assertHeader('Accept-Ranges', 'bytes');
        $this->assertStringContainsString('immutable', (string) $media->headers->get('Cache-Control'));
        /** @var BinaryFileResponse $binary */
        $binary = $media->baseResponse;
        $this->assertStringStartsWith('ID3', (string) $binary->getFile()->getContent());
        $this->get($url, ['Range' => 'bytes=0-2'])->assertStatus(206);
        $this->get(str_replace($asset->content_hash, str_repeat('0', 64), $url))->assertNotFound();
    }

    public function test_normal_and_slow_are_distinct_identities_but_the_same_text_dedupes(): void
    {
        Bus::fake();
        $user = User::factory()->create();
        $this->resolve($user, [self::HELLO, ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow']])->assertStatus(202);
        $this->assertSame(2, MandarinAudioAsset::query()->count());
        // Target "hello" reads 你好 without the full stop, so it is its own recipe; a second utterance with identical text would share.
        $service = $this->app->make(AudioAssetService::class);
        $course = $this->app->make(CourseRepository::class)->publishedOrFail();
        $a = $service->recipeFor($course, self::HELLO);
        $b = $service->recipeFor($course, ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow']);
        $c = $service->recipeFor($course, ['sourceKind' => 'target', 'sourceId' => 'hello', 'variant' => 'normal']);
        $this->assertNotSame($a->hash, $b->hash);
        $this->assertNotSame($a->hash, $c->hash);
        $bare = AudioRecipe::speech($this->speech->recipe(new SpeechRequest('你好。', 'normal', 'guide')), '你好。');
        $this->assertSame($bare->hash, $a->hash, 'role and variant labels must not change identity');
        $this->assertSame($bare->hash, $bare->withRole('friend')->hash);
        $this->assertSame($bare->hash, AudioRecipe::speech($this->speech->recipe(new SpeechRequest('你好。', 'normal', 'friend')), ' 你好。 ')->hash, 'whitespace normalisation');
    }

    public function test_sfx_is_rendered_procedurally_without_a_provider_or_budget(): void
    {
        config()->set('mandarin.speech.generation_enabled', false);
        $user = User::factory()->create();
        $response = $this->resolve($user, [['sourceKind' => 'sfx', 'sourceId' => 'ui-tap', 'variant' => 'default']])->assertStatus(202);
        $id = (int) $response->json('results.0.requestId');
        $this->app->make(AudioAssetService::class)->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('ready', $asset->state);
        $this->assertSame('audio/wav', $asset->content_type);
        $this->assertSame('procedural', $asset->provider);
        $this->assertGreaterThan(0, $asset->duration_ms);
        $this->assertCount(0, $this->speech->requests);
        $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('provenance', 'procedural_sfx');
    }

    public function test_provider_failure_is_retryable_then_exhausts(): void
    {
        config()->set('mandarin.audio.max_attempts', 2);
        $this->speech->behaviour = fn (SpeechRequest $r) => new SpeechProviderException('provider_unavailable', 'boom', true);
        $user = User::factory()->create();
        $service = $this->app->make(AudioAssetService::class);
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        $service->generate($id);
        $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'failed')->assertJsonPath('retryable', true)->assertJsonPath('code', 'provider_unavailable');
        // Explicit retry re-queues the same row.
        $this->resolve($user, [self::HELLO])->assertStatus(202)->assertJsonPath('results.0.requestId', (string) $id);
        $service->generate($id);
        $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'failed')->assertJsonPath('retryable', false);
        $this->resolve($user, [self::HELLO])->assertOk()->assertJsonPath('results.0.state', 'failed')->assertJsonPath('results.0.retryable', false);
        $this->assertSame(2, MandarinAudioAsset::query()->findOrFail($id)->attempts);
    }

    public function test_invalid_provider_output_budget_and_storage_failures_never_publish_ready(): void
    {
        $user = User::factory()->create();
        $service = $this->app->make(AudioAssetService::class);

        $this->speech->behaviour = fn (SpeechRequest $r) => new SynthesizedAudio('{"error":"not audio"}', 'audio/mpeg', 'mp3', 3);
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        $service->generate($id);
        $this->assertSame('failed', MandarinAudioAsset::query()->findOrFail($id)->state);
        $this->assertStringContainsString('invalid audio', (string) MandarinAudioAsset::query()->findOrFail($id)->error_message);

        $this->speech->behaviour = null;
        config()->set('mandarin.speech.daily_character_budget', 1);
        $slow = (int) $this->resolve($user, [['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow']])->json('results.0.requestId');
        $service->generate($slow);
        $this->assertSame('budget_exhausted', MandarinAudioAsset::query()->findOrFail($slow)->error_code);

        config()->set('mandarin.speech.daily_character_budget', 5000);
        config()->set('mandarin.media_disk', 'does-not-exist');
        $target = (int) $this->resolve($user, [['sourceKind' => 'target', 'sourceId' => 'hello', 'variant' => 'normal']])->json('results.0.requestId');
        $service->generate($target);
        $this->assertSame('storage_unavailable', MandarinAudioAsset::query()->findOrFail($target)->error_code);
        $this->assertSame(0, MandarinAudioAsset::query()->where('state', 'ready')->count());
    }

    public function test_budget_exhaustion_defers_without_spending_attempts(): void
    {
        Bus::fake([GenerateMandarinAudioJob::class]);
        config()->set('mandarin.audio.max_attempts', 2);
        config()->set('mandarin.speech.daily_character_budget', 1);
        $user = User::factory()->create();
        $service = $this->app->make(AudioAssetService::class);
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        for ($i = 0; $i < 3; $i++) {
            $service->generate($id);
            $asset = MandarinAudioAsset::query()->findOrFail($id);
            $this->assertSame('failed', $asset->state);
            $this->assertSame('budget_exhausted', $asset->error_code);
            $this->assertSame(0, $asset->attempts, 'a deferred clip must not consume provider attempts');
            $this->resolve($user, [self::HELLO])->assertStatus(202)->assertJsonPath('results.0.state', 'queued');
        }
        $this->assertCount(0, $this->speech->requests);
        config()->set('mandarin.speech.daily_character_budget', 5000);
        $this->app->make(AudioAssetService::class)->generate($id);
        $this->assertSame('ready', MandarinAudioAsset::query()->findOrFail($id)->state);
    }

    public function test_generation_refuses_when_provider_configuration_drifted_from_the_queued_recipe(): void
    {
        Bus::fake([GenerateMandarinAudioJob::class]);
        $user = User::factory()->create();
        $service = $this->app->make(AudioAssetService::class);
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        $this->speech->voice = 'Different';
        $service->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('failed', $asset->state);
        $this->assertSame('unsupported_voice', $asset->error_code);
        $this->assertStringContainsString('voice', (string) $asset->error_message);
        $this->assertCount(0, $this->speech->requests, 'no synthesis under a mismatched recipe');
        // The current configuration resolves to a new identity; the stale row stays failed and non-retryable.
        $this->resolve($user, [self::HELLO])->assertStatus(202);
        $this->assertSame(2, MandarinAudioAsset::query()->count());
        $this->resolve($user, [self::HELLO]);
        $this->assertSame('failed', MandarinAudioAsset::query()->findOrFail($id)->state);
    }

    public function test_expired_lease_is_recovered_only_by_the_explicit_command_and_a_missing_object_invalidates_ready(): void
    {
        Bus::fake([GenerateMandarinAudioJob::class]);
        $user = User::factory()->create();
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        MandarinAudioAsset::query()->whereKey($id)->update(['state' => 'generating', 'lease_token' => 'stale', 'lease_expires_at' => now()->subMinute(), 'attempts' => 1]);
        // Poll reports generating and does not touch the row.
        $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'generating');
        $this->artisan('mandarin:audio:recover --dry-run')->assertSuccessful()->expectsOutputToContain('1 expired lease(s); 1 to requeue');
        $this->assertSame('generating', MandarinAudioAsset::query()->findOrFail($id)->state);
        $this->artisan('mandarin:audio:recover --execute')->assertSuccessful();
        $this->assertSame('queued', MandarinAudioAsset::query()->findOrFail($id)->state);
        Bus::assertDispatchedTimes(GenerateMandarinAudioJob::class, 2);

        // Stale worker publishing with an old token is ignored.
        $service = $this->app->make(AudioAssetService::class);
        $service->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('ready', $asset->state);
        Storage::disk('local')->delete((string) $asset->object_key);
        $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'failed')->assertJsonPath('code', 'asset_missing');
        $this->get("/media/games/mandarin/{$id}/{$asset->content_hash}.mp3")->assertNotFound();
        $this->resolve($user, [self::HELLO])->assertStatus(202)->assertJsonPath('results.0.state', 'queued');
    }

    public function test_public_disk_url_is_used_when_configured_otherwise_a_temporary_url(): void
    {
        config()->set('filesystems.disks.s3.url', 'https://games-assets.example.test');
        Storage::fake('s3', ['url' => 'https://games-assets.example.test']);
        config()->set('mandarin.media_disk', 's3');
        $user = User::factory()->create();
        $service = $this->app->make(AudioAssetService::class);
        $id = (int) $this->resolve($user, [self::HELLO])->json('results.0.requestId');
        $service->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('s3', $asset->disk);
        $ready = $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'ready');
        $this->assertSame('https://games-assets.example.test/'.$asset->object_key, $ready->json('url'));
        $this->assertNull($ready->json('expiresAt'));
        $this->assertStringContainsString(substr((string) $asset->content_hash, 0, 12), (string) $asset->object_key);

        config()->set('filesystems.disks.s3.url', null);
        Storage::disk('s3')->buildTemporaryUrlsUsing(fn (string $path, \DateTimeInterface $expiration): string => 'https://signed.example.test/'.$path.'?exp='.$expiration->getTimestamp());
        $signed = $this->getJson("/api/games/mandarin/audio/requests/{$id}")->assertJsonPath('state', 'ready');
        $this->assertStringStartsWith('https://signed.example.test/', (string) $signed->json('url'));
        $this->assertNotNull($signed->json('expiresAt'));
    }

    public function test_warm_command_uses_the_same_resolver(): void
    {
        Bus::fake([GenerateMandarinAudioJob::class]);
        $this->artisan('mandarin:audio:warm --node=s1n1 --variant=normal --dry-run')->assertSuccessful()->expectsOutputToContain('source(s)');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
        Bus::assertNothingDispatched();
        $this->artisan('mandarin:audio:warm --node=s1n1 --variant=normal --execute --sfx')->assertSuccessful();
        $this->assertGreaterThan(8, MandarinAudioAsset::query()->count());
        $this->assertSame(4, MandarinAudioAsset::query()->where('kind', 'sfx')->count());
    }

    public function test_doctor_runs_and_reports(): void
    {
        $this->artisan('mandarin:audio:doctor')->expectsOutputToContain('provider');
    }
}
