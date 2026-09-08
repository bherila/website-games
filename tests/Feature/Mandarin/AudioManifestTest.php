<?php

namespace Tests\Feature\Mandarin;

use App\Jobs\Mandarin\GenerateMandarinAudioJob;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\Mandarin\MandarinAudioSource;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Audio\AudioManifestService;
use App\Services\Games\Mandarin\Course\CourseImporter;
use App\Services\Games\Mandarin\Speech\NullSpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;

class AudioManifestTest extends MandarinTestCase
{
    private const IDENTITY = ['courseId' => 'mandarin-foundations', 'contentVersion' => '1.0.1'];

    private const HELLO = ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal'];

    private const HELLO_SLOW = ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow'];

    private const PLEASE = ['sourceKind' => 'support', 'sourceId' => 'please', 'variant' => 'normal'];

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
        Storage::fake('s3');
        Bus::fake([GenerateMandarinAudioJob::class]);
        $this->path = sys_get_temp_dir().'/mandarin-manifest-'.bin2hex(random_bytes(6)).'.json';
    }

    protected function tearDown(): void
    {
        @unlink($this->path);
        parent::tearDown();
    }

    /** Generate through the normal resolve → worker path, exactly as playback does. */
    private function ready(array $source): MandarinAudioAsset
    {
        $response = $this->actingAs(User::factory()->create())->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [$source]])
            ->assertStatus(202);
        $id = (int) $response->json('results.0.requestId');
        $this->app->make(AudioAssetService::class)->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('ready', $asset->state);

        return $asset;
    }

    /** @return array<string, mixed> */
    private function manifest(): array
    {
        /** @var array<string, mixed> $decoded */
        $decoded = json_decode((string) file_get_contents($this->path), true, 64, JSON_THROW_ON_ERROR);

        return $decoded;
    }

    /** @param array<string, mixed> $manifest */
    private function rewrite(array $manifest): void
    {
        file_put_contents($this->path, (string) json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    private function wipeRows(): void
    {
        MandarinAudioSource::query()->delete();
        MandarinAudioAsset::query()->delete();
        $this->speech->requests = [];
    }

    public function test_export_describes_every_ready_asset_and_its_sources_without_secrets_or_urls(): void
    {
        $normal = $this->ready(self::HELLO);
        $slow = $this->ready(self::HELLO_SLOW);
        // A queued row and a failed row are not part of a cache hand-off.
        MandarinAudioAsset::query()->create(['recipe_hash' => str_repeat('b', 64), 'provider' => 'fake', 'kind' => 'speech', 'state' => MandarinAudioAsset::STATE_QUEUED, 'recipe' => '{"provider":"fake"}', 'text_length' => 3]);

        $this->artisan("mandarin:audio:export {$this->path}")
            ->assertSuccessful()
            ->expectsOutputToContain('mandarin-foundations@1.0.1')
            ->expectsOutputToContain('Wrote 2 ready asset(s) and 2 source mapping(s)');

        $raw = (string) file_get_contents($this->path);
        $this->assertStringNotContainsString('http', $raw, 'a manifest must carry no URLs');
        $this->assertStringNotContainsString(base_path(), $raw, 'a manifest must carry no absolute paths');
        $this->assertStringNotContainsString('lease_token', $raw);

        $manifest = $this->manifest();
        $this->assertSame(1, $manifest['schemaVersion']);
        $this->assertNotSame('', $manifest['exportedAt']);
        $this->assertSame([['courseId' => 'mandarin-foundations', 'contentVersion' => '1.0.1']], $manifest['courses']);
        $this->assertSame(['assets' => 2, 'sources' => 2], $manifest['counts']);
        $this->assertSame(AudioManifestService::assetsHash($manifest['assets']), $manifest['assetsHash']);

        $byHash = array_column($manifest['assets'], null, 'recipe_hash');
        $this->assertArrayHasKey((string) $normal->recipe_hash, $byHash);
        $this->assertArrayHasKey((string) $slow->recipe_hash, $byHash);
        $entry = $byHash[(string) $normal->recipe_hash];
        $this->assertSame([
            'recipe_hash', 'provider', 'kind', 'recipe', 'text_length', 'disk', 'object_key',
            'content_hash', 'content_type', 'bytes', 'duration_ms', 'provider_metadata', 'ready_at',
        ], array_keys($entry));
        $this->assertSame('fake', $entry['provider']);
        $this->assertSame('speech', $entry['kind']);
        $this->assertSame('local', $entry['disk']);
        $this->assertSame((string) $normal->object_key, $entry['object_key']);
        $this->assertSame((string) $normal->content_hash, $entry['content_hash']);
        $this->assertSame((int) $normal->bytes, $entry['bytes']);
        $this->assertSame('你好。', $entry['recipe']['text']);
        $this->assertSame(true, $entry['provider_metadata']['fake']);

        $this->assertContains(['course_id' => 'mandarin-foundations', 'content_version' => '1.0.1', 'source_kind' => 'utterance', 'source_id' => '01a', 'variant' => 'slow', 'recipe_hash' => (string) $slow->recipe_hash], $manifest['sources']);
    }

    public function test_export_can_be_limited_to_one_disk_and_refuses_an_unknown_one(): void
    {
        $this->ready(self::HELLO);
        $onS3 = $this->ready(self::HELLO_SLOW);
        MandarinAudioAsset::query()->whereKey($onS3->id)->update(['disk' => 's3']);

        $this->artisan("mandarin:audio:export {$this->path} --disk=s3")->assertSuccessful()
            ->expectsOutputToContain('Wrote 1 ready asset(s) and 1 source mapping(s)');
        $this->assertSame([(string) $onS3->recipe_hash], array_column($this->manifest()['assets'], 'recipe_hash'));

        $this->artisan("mandarin:audio:export {$this->path} --disk=nowhere")
            ->assertExitCode(1)
            ->expectsOutputToContain('Unknown disk "nowhere"');
    }

    public function test_export_leaves_out_assets_no_source_maps_to_unless_asked(): void
    {
        $current = $this->ready(self::HELLO);
        // The same line generated earlier by another voice: still ready, still on disk, but
        // no course source points at it any more, so it can never be a hit after import.
        $orphan = MandarinAudioAsset::query()->create([
            'recipe_hash' => str_repeat('c', 64), 'provider' => 'macos', 'kind' => 'speech',
            'state' => MandarinAudioAsset::STATE_READY, 'recipe' => '{"provider":"macos"}', 'text_length' => 3,
            'disk' => 'local', 'object_key' => 'games/mandarin/audio/cc/orphan.m4a', 'content_hash' => str_repeat('d', 64),
            'content_type' => 'audio/mp4', 'bytes' => 10, 'ready_at' => now(),
        ]);

        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful()
            ->expectsOutputToContain('Wrote 1 ready asset(s) and 1 source mapping(s)');
        $this->assertSame([(string) $current->recipe_hash], array_column($this->manifest()['assets'], 'recipe_hash'));

        $this->artisan("mandarin:audio:export {$this->path} --all")->assertSuccessful()
            ->expectsOutputToContain('Wrote 2 ready asset(s) and 1 source mapping(s)');
        $hashes = array_column($this->manifest()['assets'], 'recipe_hash');
        $this->assertContains((string) $orphan->recipe_hash, $hashes);
        $this->assertContains((string) $current->recipe_hash, $hashes);
    }

    public function test_an_imported_cache_serves_guests_with_no_provider_bound_at_all(): void
    {
        $normal = $this->ready(self::HELLO);
        $this->ready(self::HELLO_SLOW);
        $this->ready(self::PLEASE);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();
        $this->artisan("mandarin:audio:import {$this->path} --execute")->assertSuccessful();

        // Production shape: MANDARIN_SPEECH_PROVIDER=null, generation off, no worker.
        $this->app->instance(SpeechSynthesizer::class, new NullSpeechSynthesizer);
        config()->set('mandarin.speech.generation_enabled', false);

        $unmapped = ['sourceKind' => 'utterance', 'sourceId' => '01b', 'variant' => 'normal'];
        $response = $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO, self::HELLO_SLOW, self::PLEASE, $unmapped]])
            ->assertOk()
            ->assertJsonPath('results.0.state', 'ready')
            ->assertJsonPath('results.1.state', 'ready')
            ->assertJsonPath('results.2.state', 'ready')
            ->assertJsonPath('results.2.source.sourceKind', 'support')
            ->assertJsonPath('results.3.state', 'unavailable')
            ->assertJsonPath('results.3.code', 'provider_unconfigured');
        $this->assertSame((string) $normal->content_hash, $response->json('results.0.contentHash'));
        $this->assertSame(3, MandarinAudioAsset::query()->count(), 'nothing is claimed without a provider');
        $this->assertSame(3, MandarinAudioSource::query()->count(), 'nothing is re-pointed without a provider');
        $this->get((string) $response->json('results.0.url'))->assertOk();

        // A mapped row whose object is gone is not served and not touched: no provider could regenerate it.
        Storage::disk('local')->delete((string) $normal->object_key);
        $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO]])
            ->assertOk()
            ->assertJsonPath('results.0.state', 'unavailable')
            ->assertJsonPath('results.0.code', 'provider_unconfigured');
        $this->assertSame('ready', MandarinAudioAsset::query()->where('recipe_hash', (string) $normal->recipe_hash)->firstOrFail()->state);
    }

    public function test_ready_rows_on_a_public_url_disk_can_be_trusted_without_a_storage_call(): void
    {
        $normal = $this->ready(self::HELLO);
        MandarinAudioAsset::query()->whereKey($normal->id)->update(['disk' => 's3']);
        Storage::disk('s3')->put((string) $normal->object_key, (string) Storage::disk('local')->get((string) $normal->object_key));
        // The fake keeps a local driver; present the disk as a bucket with a public base URL.
        config()->set('filesystems.disks.s3.driver', 's3');
        config()->set('filesystems.disks.s3.url', 'https://media.example.test');
        $this->app->instance(SpeechSynthesizer::class, new NullSpeechSynthesizer);
        config()->set('mandarin.speech.generation_enabled', false);
        Storage::disk('s3')->delete((string) $normal->object_key);

        // Default: the object is checked and found absent, so the line is honestly unavailable.
        config()->set('mandarin.audio.verify_objects', true);
        $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO]])
            ->assertOk()->assertJsonPath('results.0.state', 'unavailable');

        // Trusting: a ready row on a public-URL disk is served from its recorded key, storage untouched.
        config()->set('mandarin.audio.verify_objects', false);
        $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO]])
            ->assertOk()
            ->assertJsonPath('results.0.state', 'ready')
            ->assertJsonPath('results.0.contentHash', (string) $normal->content_hash);
        $this->assertFalse(Storage::disk('s3')->exists((string) $normal->object_key), 'served without the object being consulted');
        $this->assertSame('ready', MandarinAudioAsset::query()->findOrFail($normal->id)->state);

        // Never for a local disk: the media route has to read the bytes.
        MandarinAudioAsset::query()->whereKey($normal->id)->update(['disk' => 'local']);
        Storage::disk('local')->delete((string) $normal->object_key);
        $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO]])
            ->assertOk()->assertJsonPath('results.0.state', 'unavailable');
    }

    public function test_dry_run_changes_nothing_then_execute_recreates_the_cache_for_guests(): void
    {
        $normal = $this->ready(self::HELLO);
        $slow = $this->ready(self::HELLO_SLOW);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $keys = [(string) $normal->object_key, (string) $slow->object_key];
        $this->wipeRows();

        $this->artisan("mandarin:audio:import {$this->path} --dry-run")
            ->assertSuccessful()
            ->expectsOutputToContain('Manifest: schema 1, exported ')
            ->expectsOutputToContain('Would insert 2, refresh 0, leave 0 unchanged, skip 0 conflict(s) and 0 unverified object(s); 2 source mapping(s) would change.')
            ->expectsOutputToContain('Nothing was written (--dry-run).');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
        $this->assertSame(0, MandarinAudioSource::query()->count());

        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('Inserted 2, refreshed 0, left 0 unchanged, skipped 0 conflict(s) and 0 unverified object(s); 2 source mapping(s) written.');

        $this->assertSame(2, MandarinAudioAsset::query()->where('state', 'ready')->count());
        $this->assertSame(2, MandarinAudioSource::query()->count());
        $restored = MandarinAudioAsset::query()->where('recipe_hash', $normal->recipe_hash)->firstOrFail();
        $this->assertSame('local', $restored->disk);
        $this->assertSame($normal->object_key, $restored->object_key);
        $this->assertSame($normal->content_hash, $restored->content_hash);
        $this->assertSame($normal->content_type, $restored->content_type);
        $this->assertSame($normal->bytes, $restored->bytes);
        $this->assertSame($normal->duration_ms, $restored->duration_ms);
        $this->assertSame($normal->text_length, $restored->text_length);
        $this->assertSame($normal->recipeArray(), $restored->recipeArray());
        $this->assertNotNull($restored->ready_at);
        $this->assertSame(0, $restored->attempts);
        foreach ($keys as $key) {
            Storage::disk('local')->assertExists($key);
        }

        // The whole point: a guest gets cache hits with no provider and generation off.
        config()->set('mandarin.speech.generation_enabled', false);
        $response = $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', self::IDENTITY + ['sources' => [self::HELLO, self::HELLO_SLOW]])
            ->assertOk()
            ->assertJsonPath('results.0.state', 'ready')
            ->assertJsonPath('results.1.state', 'ready');
        $this->assertStringContainsString('/media/games/mandarin/', (string) $response->json('results.0.url'));
        $this->assertSame((string) $normal->content_hash, $response->json('results.0.contentHash'));
        $this->assertCount(0, $this->speech->requests, 'an imported cache must never call a provider');
        $this->assertSame(2, MandarinAudioAsset::query()->count(), 'a cache hit claims nothing new');
        $this->get((string) $response->json('results.0.url'))->assertOk()->assertHeader('Content-Type', 'audio/mpeg');
    }

    public function test_a_second_execute_is_a_no_op(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();

        $this->artisan("mandarin:audio:import {$this->path} --execute")->assertSuccessful();
        $before = MandarinAudioAsset::query()->firstOrFail();

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('Inserted 0, refreshed 0, left 1 unchanged, skipped 0 conflict(s) and 0 unverified object(s); 0 source mapping(s) written.');

        $this->assertSame(1, MandarinAudioAsset::query()->count());
        $this->assertSame(1, MandarinAudioSource::query()->count());
        $after = MandarinAudioAsset::query()->firstOrFail();
        $this->assertSame($before->id, $after->id);
        $this->assertEquals($before->updated_at, $after->updated_at, 'an unchanged row is not rewritten');
    }

    public function test_a_ready_row_with_different_bytes_is_a_conflict_and_is_never_downgraded(): void
    {
        $asset = $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        // The same recipe is ready here from a different generation run.
        MandarinAudioAsset::query()->whereKey($asset->id)->update([
            'content_hash' => str_repeat('c', 64),
            'object_key' => 'games/mandarin/audio/cc/local-copy.mp3',
            'disk' => 's3',
        ]);

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('already ready here with a different content hash; left untouched')
            ->expectsOutputToContain('Inserted 0, refreshed 0, left 0 unchanged, skipped 1 conflict(s) and 0 unverified object(s); 0 source mapping(s) written.');

        $kept = MandarinAudioAsset::query()->findOrFail($asset->id);
        $this->assertSame('ready', $kept->state);
        $this->assertSame('s3', $kept->disk);
        $this->assertSame(str_repeat('c', 64), $kept->content_hash);
        $this->assertSame('games/mandarin/audio/cc/local-copy.mp3', $kept->object_key);
    }

    public function test_a_failed_row_is_refreshed_into_a_ready_one(): void
    {
        $asset = $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        MandarinAudioAsset::query()->whereKey($asset->id)->update([
            'state' => MandarinAudioAsset::STATE_FAILED,
            'error_code' => 'provider_unavailable',
            'error_message' => 'boom',
            'disk' => null,
            'object_key' => null,
            'content_hash' => null,
            'attempts' => 3,
        ]);

        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('Inserted 0, refreshed 1, left 0 unchanged, skipped 0 conflict(s) and 0 unverified object(s)');

        $healed = MandarinAudioAsset::query()->findOrFail($asset->id);
        $this->assertSame('ready', $healed->state);
        $this->assertSame('local', $healed->disk);
        $this->assertSame($asset->content_hash, $healed->content_hash);
        $this->assertNull($healed->error_code);
        $this->assertNull($healed->error_message);
    }

    public function test_verify_objects_refuses_to_publish_a_row_whose_object_is_absent(): void
    {
        $present = $this->ready(self::HELLO);
        $absent = $this->ready(self::HELLO_SLOW);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        Storage::disk('local')->delete((string) $absent->object_key);

        // Verification must not trust a matching ready database row when its object is gone.
        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --dry-run --strict")
            ->assertFailed()
            ->expectsOutputToContain('Strict import failed because the manifest was not imported completely.');
        $this->assertSame(2, MandarinAudioAsset::query()->count());

        $this->wipeRows();
        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --dry-run --strict")
            ->assertFailed();
        $this->assertSame(0, MandarinAudioAsset::query()->count());

        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('object is missing on local')
            ->expectsOutputToContain('Inserted 1, refreshed 0, left 0 unchanged, skipped 0 conflict(s) and 1 unverified object(s); 1 source mapping(s) written.')
            ->expectsOutputToContain('1 source mapping(s) were skipped');

        $this->assertSame([(string) $present->recipe_hash], MandarinAudioAsset::query()->pluck('recipe_hash')->all());
        $this->assertSame(['normal'], MandarinAudioSource::query()->pluck('variant')->all());

        // A truncated object is refused just as firmly as a missing one.
        Storage::disk('local')->put((string) $absent->object_key, 'ID3');
        $this->artisan("mandarin:audio:import {$this->path} --verify-objects --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('bytes, manifest says');
        $this->assertSame(1, MandarinAudioAsset::query()->count());

        // Without the flag the row is trusted and imported.
        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertSuccessful()
            ->expectsOutputToContain('Inserted 1, refreshed 0, left 1 unchanged');
        $this->assertSame(2, MandarinAudioAsset::query()->count());
    }

    public function test_an_unconfigured_disk_is_refused_before_anything_is_written(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();
        $manifest = $this->manifest();
        $manifest['assets'][0]['disk'] = 'nowhere';
        $manifest['assetsHash'] = AudioManifestService::assetsHash($manifest['assets']);
        $this->rewrite($manifest);

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertExitCode(1)
            ->expectsOutputToContain('unconfigured disk(s): nowhere');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }

    public function test_a_course_revision_that_was_never_imported_is_refused(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();
        $manifest = $this->manifest();
        $manifest['courses'][0]['contentVersion'] = '9.9.9';
        $manifest['sources'][0]['content_version'] = '9.9.9';
        $this->rewrite($manifest);

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertExitCode(1)
            ->expectsOutputToContain('No imported course revision for: mandarin-foundations@9.9.9');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }

    public function test_deployment_requires_the_manifest_to_cover_the_configured_course(): void
    {
        $checkedIn = resource_path('data/mandarin/audio-manifest.json');
        $this->artisan("mandarin:audio:import {$checkedIn} --dry-run --require-configured-course")
            ->assertSuccessful();

        $older = $this->courseJson();
        $older['contentVersion'] = '1.0.0';
        $this->app->make(CourseImporter::class)->import($older);
        $manifest = $this->app->make(AudioManifestService::class)->parseFile($checkedIn);
        $manifest['courses'][0]['contentVersion'] = '1.0.0';
        foreach ($manifest['sources'] as &$source) {
            $source['content_version'] = '1.0.0';
        }
        unset($source);
        $this->rewrite($manifest);

        $this->artisan("mandarin:audio:import {$this->path} --dry-run --require-configured-course")
            ->assertFailed()
            ->expectsOutputToContain('Manifest does not cover configured course mandarin-foundations@1.0.1');
    }

    public function test_a_source_outside_the_imported_course_revision_is_refused(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();
        $manifest = $this->manifest();
        $manifest['sources'][0]['source_kind'] = 'support';
        $manifest['sources'][0]['source_id'] = 'missing';
        $this->rewrite($manifest);

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertExitCode(1)
            ->expectsOutputToContain('outside their course revision');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
        $this->assertSame(0, MandarinAudioSource::query()->count());
    }

    public function test_a_corrupt_or_unreadable_manifest_is_refused(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();

        $this->artisan("mandarin:audio:import {$this->path}")
            ->assertExitCode(1)
            ->expectsOutputToContain('Pass --dry-run');
        $this->artisan('mandarin:audio:import '.$this->path.'.nope --dry-run')
            ->assertExitCode(1)
            ->expectsOutputToContain('does not exist or is not readable');

        $manifest = $this->manifest();
        $manifest['assets'][0]['bytes'] = 1;
        $this->rewrite($manifest);
        $this->artisan("mandarin:audio:import {$this->path} --dry-run")
            ->assertExitCode(1)
            ->expectsOutputToContain('assetsHash does not match');

        $manifest['schemaVersion'] = 2;
        $manifest['assetsHash'] = AudioManifestService::assetsHash($manifest['assets']);
        $this->rewrite($manifest);
        $this->artisan("mandarin:audio:import {$this->path} --dry-run")
            ->assertExitCode(1)
            ->expectsOutputToContain('Unsupported manifest schemaVersion');

        file_put_contents($this->path, 'not json');
        $this->artisan("mandarin:audio:import {$this->path} --dry-run")
            ->assertExitCode(1)
            ->expectsOutputToContain('not valid JSON');
    }

    public function test_an_object_key_that_escapes_the_media_prefix_is_refused(): void
    {
        $this->ready(self::HELLO);
        $this->artisan("mandarin:audio:export {$this->path}")->assertSuccessful();
        $this->wipeRows();
        $manifest = $this->manifest();
        $manifest['assets'][0]['object_key'] = '../../../etc/passwd';
        $manifest['assetsHash'] = AudioManifestService::assetsHash($manifest['assets']);
        $this->rewrite($manifest);

        $this->artisan("mandarin:audio:import {$this->path} --execute")
            ->assertExitCode(1)
            ->expectsOutputToContain('not a relative storage key');
        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }
}
