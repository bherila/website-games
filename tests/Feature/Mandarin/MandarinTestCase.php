<?php

namespace Tests\Feature\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioValidator;
use App\Services\Games\Mandarin\Course\CourseImporter;
use App\Services\Games\Mandarin\Speech\ProcessRunner;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

abstract class MandarinTestCase extends TestCase
{
    use RefreshDatabase;

    protected FakeSpeechSynthesizer $speech;

    protected function setUp(): void
    {
        parent::setUp();
        $this->speech = new FakeSpeechSynthesizer;
        $this->app->instance(SpeechSynthesizer::class, $this->speech);
        // No ffprobe in tests: container checks only.
        $this->app->bind(AudioValidator::class, fn ($app): AudioValidator => new AudioValidator($app->make(ProcessRunner::class), null));
        Storage::fake('local');
        config()->set('mandarin.media_disk', 'local');
        config()->set('mandarin.speech.generation_enabled', true);
        config()->set('mandarin.speech.daily_character_budget', 5000);
        config()->set('queue.default', 'sync');
        config()->set('cache.default', 'array');
    }

    protected function importCourse(): void
    {
        $this->app->make(CourseImporter::class)->importFile(resource_path('data/mandarin/foundations.v1.json'));
    }

    /** @return array<string, mixed> */
    protected function courseJson(): array
    {
        /** @var array<string, mixed> $decoded */
        $decoded = json_decode((string) file_get_contents(resource_path('data/mandarin/foundations.v1.json')), true, 512, JSON_THROW_ON_ERROR);

        return $decoded;
    }

    /** @return array<string, mixed> */
    protected function responseEvent(array $overrides = []): array
    {
        return array_merge([
            'courseId' => 'mandarin-foundations',
            'contentVersion' => '1.0.0',
            'schemaVersion' => 1,
            'clientEventId' => 'evt-'.bin2hex(random_bytes(4)),
            'clientInstanceId' => 'client-a',
            'sessionId' => 'session-a',
            'clientOccurredAt' => now()->toIso8601String(),
            'opportunityId' => 'opp-1',
            'kind' => 'response',
            'mode' => 'lesson',
            'sceneId' => 's1',
            'nodeId' => 's1n1',
            'exerciseId' => 'e001',
            'source' => ['sourceKind' => 'utterance', 'sourceId' => '01a', 'variant' => 'normal'],
            'responseAction' => 'answer',
            'selectedOptionId' => 'e001-o1',
            'orderedTileIds' => null,
            'textHelpUsed' => false,
            'pinyinHelpUsed' => false,
            'audioEvidence' => ['status' => 'completed', 'normalPlayCount' => 1, 'slowPlayCount' => 0, 'interrupted' => false],
        ], $overrides);
    }
}
