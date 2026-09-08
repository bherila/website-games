<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use Illuminate\Support\Facades\Storage;

class AudioMigrateCommandTest extends MandarinTestCase
{
    private const HELLO = ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal'];

    private const HELLO_SLOW = ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
        Storage::fake('s3');
    }

    /** Generate through the normal resolve → worker path, exactly as playback does. */
    private function ready(array $source): MandarinAudioAsset
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/games/mandarin/audio/resolve', [
                'courseId' => 'mandarin-foundations',
                'contentVersion' => '1.1.0',
                'sources' => [$source],
            ])->assertStatus(202);
        $id = (int) $response->json('results.0.requestId');
        $this->app->make(AudioAssetService::class)->generate($id);
        $asset = MandarinAudioAsset::query()->findOrFail($id);
        $this->assertSame('ready', $asset->state);
        $this->assertSame('local', $asset->disk);

        return $asset;
    }

    public function test_dry_run_lists_the_pending_rows_and_changes_nothing(): void
    {
        $asset = $this->ready(self::HELLO);

        $this->artisan('mandarin:audio:migrate --to=s3 --dry-run')
            ->assertSuccessful()
            ->expectsOutputToContain('1 ready asset(s) would move to "s3".')
            ->expectsOutputToContain((string) $asset->object_key);

        $this->assertSame('local', MandarinAudioAsset::query()->findOrFail($asset->id)->disk);
        Storage::disk('s3')->assertMissing((string) $asset->object_key);
        Storage::disk('local')->assertExists((string) $asset->object_key);
    }

    public function test_execute_copies_verifies_and_repoints_then_is_a_no_op(): void
    {
        $first = $this->ready(self::HELLO);
        $second = $this->ready(self::HELLO_SLOW);

        $this->artisan('mandarin:audio:migrate --to=s3 --execute')
            ->assertSuccessful()
            ->expectsOutputToContain('Migrated 2 of 2 ready asset(s) to "s3"; 0 skipped; 0 source object(s) deleted.');

        foreach ([$first, $second] as $asset) {
            $key = (string) $asset->object_key;
            $moved = MandarinAudioAsset::query()->findOrFail($asset->id);
            $this->assertSame('s3', $moved->disk);
            // The key, the hash and the recorded size are untouched: objects are content-addressed.
            $this->assertSame($key, $moved->object_key);
            $this->assertSame($asset->content_hash, $moved->content_hash);
            $this->assertSame($asset->bytes, $moved->bytes);
            Storage::disk('s3')->assertExists($key);
            $this->assertSame($asset->content_hash, hash('sha256', (string) Storage::disk('s3')->get($key)));
            // Source kept by default.
            Storage::disk('local')->assertExists($key);
        }

        // Resumable: nothing is left to do.
        $this->artisan('mandarin:audio:migrate --to=s3 --dry-run')
            ->assertSuccessful()
            ->expectsOutputToContain('0 ready asset(s) would move to "s3".');
        $this->artisan('mandarin:audio:migrate --to=s3 --execute')
            ->assertSuccessful()
            ->expectsOutputToContain('Migrated 0 of 0 ready asset(s)');
    }

    public function test_a_corrupted_source_is_skipped_and_stays_on_its_disk(): void
    {
        $bad = $this->ready(self::HELLO);
        $good = $this->ready(self::HELLO_SLOW);
        Storage::disk('local')->put((string) $bad->object_key, 'ID3'.str_repeat("\0", 7).'TAMPERED');

        $this->artisan('mandarin:audio:migrate --to=s3 --execute --delete-source')
            ->assertSuccessful()
            ->expectsOutputToContain('do not match content_hash')
            ->expectsOutputToContain('Migrated 1 of 2 ready asset(s) to "s3"; 1 skipped; 1 source object(s) deleted.')
            ->expectsOutputToContain('Skipped rows kept their existing disk');

        $corrupt = MandarinAudioAsset::query()->findOrFail($bad->id);
        $this->assertSame('local', $corrupt->disk);
        $this->assertSame('ready', $corrupt->state, 'a skipped row is left exactly as it was');
        Storage::disk('s3')->assertMissing((string) $bad->object_key);
        Storage::disk('local')->assertExists((string) $bad->object_key);

        // The verified one moved, and only its source was deleted.
        $this->assertSame('s3', MandarinAudioAsset::query()->findOrFail($good->id)->disk);
        Storage::disk('s3')->assertExists((string) $good->object_key);
        Storage::disk('local')->assertMissing((string) $good->object_key);
    }

    public function test_a_missing_source_is_skipped_and_never_marked_ready_on_the_target(): void
    {
        $asset = $this->ready(self::HELLO);
        Storage::disk('local')->delete((string) $asset->object_key);

        $this->artisan('mandarin:audio:migrate --to=s3 --execute')
            ->assertSuccessful()
            ->expectsOutputToContain('source object is missing on local')
            ->expectsOutputToContain('Migrated 0 of 1 ready asset(s) to "s3"; 1 skipped');

        $this->assertSame('local', MandarinAudioAsset::query()->findOrFail($asset->id)->disk);
        Storage::disk('s3')->assertMissing((string) $asset->object_key);
    }

    public function test_delete_source_removes_the_source_only_after_a_verified_move(): void
    {
        $asset = $this->ready(self::HELLO);
        $key = (string) $asset->object_key;

        $this->artisan('mandarin:audio:migrate --to=s3 --execute --delete-source')
            ->assertSuccessful()
            ->expectsOutputToContain('1 source object(s) deleted.');

        $this->assertSame('s3', MandarinAudioAsset::query()->findOrFail($asset->id)->disk);
        Storage::disk('local')->assertMissing($key);
        Storage::disk('s3')->assertExists($key);
        $this->assertSame($asset->content_hash, hash('sha256', (string) Storage::disk('s3')->get($key)));
    }

    public function test_the_limit_bounds_a_run_and_the_rest_moves_next_time(): void
    {
        $this->ready(self::HELLO);
        $this->ready(self::HELLO_SLOW);

        $this->artisan('mandarin:audio:migrate --to=s3 --execute --limit=1')
            ->assertSuccessful()
            ->expectsOutputToContain('Migrated 1 of 1 ready asset(s)');
        $this->assertSame(1, MandarinAudioAsset::query()->where('disk', 's3')->count());

        $this->artisan('mandarin:audio:migrate --to=s3 --execute')->assertSuccessful();
        $this->assertSame(2, MandarinAudioAsset::query()->where('disk', 's3')->count());
    }

    public function test_only_ready_rows_are_considered(): void
    {
        $ready = $this->ready(self::HELLO);
        MandarinAudioAsset::query()->create([
            'recipe_hash' => str_repeat('a', 64),
            'provider' => 'fake',
            'kind' => 'speech',
            'state' => MandarinAudioAsset::STATE_QUEUED,
            'recipe' => '{"provider":"fake"}',
            'text_length' => 3,
        ]);

        $this->artisan('mandarin:audio:migrate --to=s3 --dry-run')
            ->assertSuccessful()
            ->expectsOutputToContain('1 ready asset(s) would move to "s3".');
        $this->artisan('mandarin:audio:migrate --to=s3 --execute')->assertSuccessful();

        $this->assertSame('s3', MandarinAudioAsset::query()->findOrFail($ready->id)->disk);
        $this->assertSame(1, MandarinAudioAsset::query()->whereNull('disk')->count());
    }

    public function test_an_unknown_target_disk_fails_without_touching_anything(): void
    {
        $asset = $this->ready(self::HELLO);

        $this->artisan('mandarin:audio:migrate --to=nowhere --execute')
            ->assertExitCode(1)
            ->expectsOutputToContain('Unknown disk "nowhere"');

        $this->assertSame('local', MandarinAudioAsset::query()->findOrFail($asset->id)->disk);
    }

    public function test_a_target_disk_is_required_and_so_is_a_mode(): void
    {
        $this->artisan('mandarin:audio:migrate --execute')
            ->assertExitCode(1)
            ->expectsOutputToContain('Pass --to=<disk>');
        $this->artisan('mandarin:audio:migrate --to=s3')
            ->assertExitCode(1)
            ->expectsOutputToContain('Pass --dry-run');
    }
}
