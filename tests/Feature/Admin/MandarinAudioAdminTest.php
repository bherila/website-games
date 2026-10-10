<?php

namespace Tests\Feature\Admin;

use App\Jobs\Mandarin\GenerateMandarinAudioJob;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Models\User;
use App\Services\Games\Mandarin\Audio\AudioAssetService;
use App\Services\Games\Mandarin\Audio\AudioCatalog;
use App\Services\Games\Mandarin\Audio\AudioOperations;
use App\Services\Games\Mandarin\Course\CourseRepository;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\Bus;
use Tests\Feature\Mandarin\MandarinTestCase;

/**
 * The admin panel's audio dashboard API: gating, listing, and the four paid actions with their
 * audit rows.
 */
class MandarinAudioAdminTest extends MandarinTestCase
{
    private const HELLO = 'utterance:01a:normal';

    private const ACTIONS = [
        '/api/admin/mandarin/audio/request' => ['source' => self::HELLO],
        '/api/admin/mandarin/audio/regenerate' => ['source' => self::HELLO, 'confirm' => 1],
        '/api/admin/mandarin/audio/request-missing' => ['confirm' => 1],
        '/api/admin/mandarin/audio/retry-failed' => [],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->importCourse();
        Bus::fake([GenerateMandarinAudioJob::class]);
    }

    public function test_guests_get_401_from_every_endpoint(): void
    {
        $this->getJson('/api/admin/mandarin/audio')->assertUnauthorized();
        foreach (self::ACTIONS as $uri => $payload) {
            $this->postJson($uri, $payload)->assertUnauthorized();
        }

        $this->assertNothingHappened();
    }

    public function test_a_signed_in_account_that_is_not_an_administrator_gets_403_from_every_endpoint(): void
    {
        $player = User::factory()->create();

        $this->actingAs($player)->getJson('/api/admin/mandarin/audio')->assertForbidden();
        foreach (self::ACTIONS as $uri => $payload) {
            $this->actingAs($player)->postJson($uri, $payload)->assertForbidden();
        }

        $this->assertNothingHappened();
    }

    public function test_the_actions_need_the_csrf_token(): void
    {
        // The test kernel skips CSRF unless asked; this proves the routes sit in the web group.
        $this->withMiddleware(ValidateCsrfToken::class);
        $this->app->detectEnvironment(fn () => 'local');

        $this->actingAs($this->admin())->post('/api/admin/mandarin/audio/request', ['source' => self::HELLO])->assertStatus(419);
        $this->assertSame(0, MandarinAudioAsset::query()->count());
    }

    public function test_the_dashboard_lists_every_source_with_its_state_and_filters_and_pages(): void
    {
        $admin = $this->admin();
        $total = count($this->app->make(AudioCatalog::class)->sources($this->app->make(CourseRepository::class)->publishedOrFail()));
        $ready = $this->ready(self::HELLO, $admin);

        $page = $this->actingAs($admin)->getJson('/api/admin/mandarin/audio')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame($total, array_sum($page->json('summary')));
        // Sources whose text is identical share one recipe, so one clip can make several ready.
        $sharing = $page->json('summary.ready');
        $this->assertGreaterThanOrEqual(1, $sharing);
        $this->assertSame($total - $sharing, $page->json('summary.missing'));
        $this->assertSame($total, $page->json('total'));
        $this->assertCount(25, $page->json('entries'));
        $this->assertFalse($page->json('pending'));

        $filtered = $this->actingAs($admin)->getJson('/api/admin/mandarin/audio?state=ready&q=01a:normal')->assertOk();
        $this->assertSame(1, $filtered->json('total'));
        $filtered->assertJsonPath('entries.0.key', self::HELLO)
            ->assertJsonPath('entries.0.text', '你好。')
            ->assertJsonPath('entries.0.state', 'ready')
            ->assertJsonPath('entries.0.assetId', $ready->id)
            ->assertJsonPath('entries.0.provider', 'fake');
        $this->assertStringContainsString("/media/games/mandarin/{$ready->id}/{$ready->content_hash}.mp3", (string) $filtered->json('entries.0.url'));
        // The summary always covers the whole revision, whatever the filter.
        $this->assertSame($total, array_sum($filtered->json('summary')));

        $search = $this->actingAs($admin)->getJson('/api/admin/mandarin/audio?q=hello')->assertOk();
        $this->assertGreaterThanOrEqual(1, $search->json('total'));
        foreach ($search->json('entries') as $entry) {
            $this->assertStringContainsString('hello', mb_strtolower($entry['key'].' '.$entry['en'].' '.$entry['pinyin'].' '.$entry['text']));
        }

        $last = (int) ceil($total / 25);
        $this->actingAs($admin)->getJson("/api/admin/mandarin/audio?page={$last}")->assertOk()
            ->assertJsonPath('page', $last)->assertJsonPath('lastPage', $last)
            ->assertJsonCount($total - 25 * ($last - 1), 'entries');
        $this->actingAs($admin)->getJson('/api/admin/mandarin/audio?state=bogus')->assertUnprocessable();

        // Listing never generates: the one job is the one ready() queued.
        Bus::assertDispatchedTimes(GenerateMandarinAudioJob::class, 1);
        $this->assertSame(1, MandarinAudioAsset::query()->count());
    }

    public function test_requesting_one_missing_source_queues_it_once_and_audits_it_once(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', ['source' => self::HELLO])->assertOk()
            ->assertJsonPath('action', 'request')->assertJsonPath('queued', 1)->assertJsonPath('skipped', []);
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', ['source' => self::HELLO])->assertOk()
            ->assertJsonPath('queued', 0)->assertJsonPath('skipped.0.reason', 'queued');

        Bus::assertDispatchedTimes(GenerateMandarinAudioJob::class, 1);
        $this->assertSame(1, MandarinAudioAsset::query()->count());
        $row = AuthAuditLog::query()->sole();
        $this->assertSame('mandarin_audio_requested', $row->event);
        $this->assertSame('session', $row->auth_method);
        $this->assertSame($admin->id, $row->user_id);
        $this->assertSame($admin->id, $row->acting_user_id);
        $this->assertSame([
            'action' => 'request',
            'count' => 1,
            'course_id' => 'mandarin-foundations',
            'content_version' => '1.1.1',
            'sources' => [self::HELLO],
            'sources_truncated' => false,
        ], $row->metadata);

        $this->actingAs($admin)->getJson('/api/admin/mandarin/audio?state=queued&q='.urlencode(self::HELLO))->assertJsonPath('total', 1)->assertJsonPath('pending', true);
    }

    public function test_an_unknown_or_malformed_source_is_refused(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', ['source' => 'utterance:nope:normal'])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', ['source' => 'text:01a:normal'])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', [])->assertUnprocessable();

        $this->assertNothingHappened();
    }

    public function test_regenerating_needs_an_explicit_confirmation_and_requeues_only_a_ready_clip(): void
    {
        $admin = $this->admin();
        $ready = $this->ready(self::HELLO, $admin);
        $audited = AuthAuditLog::query()->count();

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/regenerate', ['source' => self::HELLO])->assertUnprocessable()->assertJsonValidationErrors('confirm');
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/regenerate', ['source' => self::HELLO, 'confirm' => 0])->assertUnprocessable();
        $this->assertSame('ready', $ready->refresh()->state);

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/regenerate', ['source' => self::HELLO, 'confirm' => 1])->assertOk()->assertJsonPath('queued', 1);
        $ready->refresh();
        $this->assertSame('queued', $ready->state);
        $this->assertSame(0, $ready->attempts);

        // Already queued: a second regenerate is a no-op, and so is regenerating a missing source.
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/regenerate', ['source' => self::HELLO, 'confirm' => 1])->assertOk()
            ->assertJsonPath('queued', 0)->assertJsonPath('skipped.0.reason', 'queued');
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/regenerate', ['source' => 'utterance:01a:slow', 'confirm' => 1])->assertOk()
            ->assertJsonPath('queued', 0)->assertJsonPath('skipped.0.reason', 'missing');

        $this->assertSame($audited + 1, AuthAuditLog::query()->count());
        $this->assertSame('regenerate', AuthAuditLog::query()->orderByDesc('id')->first()?->metadata['action']);

        // The worker publishes the new clip.
        $this->app->make(AudioAssetService::class)->generate($ready->id);
        $this->assertSame('ready', $ready->refresh()->state);
    }

    public function test_request_all_missing_needs_confirmation_queues_exactly_the_missing_ones_and_is_idempotent(): void
    {
        $admin = $this->admin();
        $course = $this->app->make(CourseRepository::class)->publishedOrFail();
        $this->ready(self::HELLO, $admin);
        $operations = $this->app->make(AudioOperations::class);
        $operations->request($course, ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow'], $admin);
        $assetsBefore = MandarinAudioAsset::query()->count();
        $missing = $this->actingAs($admin)->getJson('/api/admin/mandarin/audio')->json('summary.missing');
        $auditedBefore = AuthAuditLog::query()->count();
        $dispatchedBefore = Bus::dispatched(GenerateMandarinAudioJob::class)->count();

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request-missing')->assertUnprocessable()->assertJsonValidationErrors('confirm');
        $this->assertSame($assetsBefore, MandarinAudioAsset::query()->count());

        $response = $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request-missing', ['confirm' => 1])->assertOk();
        // Text shared by two sources is one recipe, so rows can be fewer than sources queued.
        $queued = (int) $response->json('queued');
        $this->assertSame($missing, $queued + count($response->json('skipped')));
        $this->assertSame([], $response->json('skipped'));
        $this->assertGreaterThan(AudioOperations::AUDITED_KEYS, $queued);
        $summary = $this->actingAs($admin)->getJson('/api/admin/mandarin/audio')->json('summary');
        $this->assertSame(0, $summary['missing']);
        $this->assertSame(1, MandarinAudioAsset::query()->where('state', 'ready')->count());
        $newRows = MandarinAudioAsset::query()->count() - $assetsBefore;
        $this->assertSame($newRows, Bus::dispatched(GenerateMandarinAudioJob::class)->count() - $dispatchedBefore);

        $audit = AuthAuditLog::query()->orderByDesc('id')->first();
        $this->assertSame($auditedBefore + 1, AuthAuditLog::query()->count());
        $this->assertSame('request_missing', $audit?->metadata['action']);
        $this->assertSame($queued, $audit?->metadata['count']);
        $this->assertCount(min($queued, AudioOperations::AUDITED_KEYS), $audit?->metadata['sources']);
        $this->assertSame($queued > AudioOperations::AUDITED_KEYS, $audit?->metadata['sources_truncated']);

        // Repeat: nothing is missing, nothing is queued, nothing is audited.
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request-missing', ['confirm' => 1])->assertOk()->assertJsonPath('queued', 0);
        $this->assertSame($auditedBefore + 1, AuthAuditLog::query()->count());
        $this->assertSame($newRows, Bus::dispatched(GenerateMandarinAudioJob::class)->count() - $dispatchedBefore);
    }

    public function test_retry_all_failed_requeues_failed_rows_with_attempts_reset_and_leaves_the_rest(): void
    {
        $admin = $this->admin();
        $course = $this->app->make(CourseRepository::class)->publishedOrFail();
        $operations = $this->app->make(AudioOperations::class);
        $operations->request($course, ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal'], $admin);
        $operations->request($course, ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'slow'], $admin);
        [$failed, $queued] = MandarinAudioAsset::query()->orderBy('id')->get()->all();
        // Exhausted: playback would never retry this one again.
        $failed->forceFill(['state' => 'failed', 'attempts' => 3, 'error_code' => 'provider_unavailable', 'error_message' => 'boom'])->save();
        $auditedBefore = AuthAuditLog::query()->count();

        $this->actingAs($admin)->getJson('/api/admin/mandarin/audio?state=failed')
            ->assertJsonPath('entries.0.error', 'boom')->assertJsonPath('entries.0.code', 'provider_unavailable')->assertJsonPath('entries.0.attempts', 3);

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/retry-failed')->assertOk()->assertJsonPath('queued', 1);
        $failed->refresh();
        $this->assertSame('queued', $failed->state);
        $this->assertSame(0, $failed->attempts);
        $this->assertNull($failed->error_code);
        $this->assertSame('queued', $queued->refresh()->state);
        $this->assertSame($auditedBefore + 1, AuthAuditLog::query()->count());
        $this->assertSame('retry_failed', AuthAuditLog::query()->orderByDesc('id')->first()?->metadata['action']);

        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/retry-failed')->assertOk()->assertJsonPath('queued', 0);
        $this->assertSame($auditedBefore + 1, AuthAuditLog::query()->count());
    }

    public function test_with_generation_disabled_speech_is_not_queued_and_nothing_is_audited(): void
    {
        config()->set('mandarin.speech.generation_enabled', false);
        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/admin/mandarin/audio')->assertJsonPath('generationEnabled', false);
        $this->actingAs($admin)->postJson('/api/admin/mandarin/audio/request', ['source' => self::HELLO])->assertOk()
            ->assertJsonPath('queued', 0)->assertJsonPath('skipped.0.reason', 'generation_disabled');

        $this->assertNothingHappened();
    }

    private function admin(): User
    {
        return User::factory()->administrator()->create();
    }

    /** Generate a source through the admin action and the worker. */
    private function ready(string $key, User $admin): MandarinAudioAsset
    {
        $course = $this->app->make(CourseRepository::class)->publishedOrFail();
        $source = $this->app->make(AudioCatalog::class)->source($course, $key);
        $this->assertNotNull($source);
        $this->app->make(AudioOperations::class)->request($course, $source, $admin);
        $asset = MandarinAudioAsset::query()->latest('id')->firstOrFail();
        $this->app->make(AudioAssetService::class)->generate($asset->id);

        return $asset->refresh();
    }

    private function assertNothingHappened(): void
    {
        Bus::assertNotDispatched(GenerateMandarinAudioJob::class);
        $this->assertSame(0, MandarinAudioAsset::query()->count());
        $this->assertSame(0, AuthAuditLog::query()->count());
    }
}
