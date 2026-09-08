<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinCourseRevision;
use App\Services\Games\Mandarin\Course\CourseImporter;
use App\Services\Games\Mandarin\Course\CourseImportException;
use App\Services\Games\Mandarin\Course\CourseRepository;
use RuntimeException;

class CourseImportTest extends MandarinTestCase
{
    public function test_import_is_idempotent_and_rejects_a_mutated_revision(): void
    {
        $importer = $this->app->make(CourseImporter::class);
        $first = $importer->importFile(resource_path('data/mandarin/foundations.v1.json'));
        $this->assertSame('imported', $first['status']);
        $this->assertFalse($first['revision']->native_reviewed);
        $this->assertFalse($first['revision']->audio_auditioned);

        $second = $importer->importFile(resource_path('data/mandarin/foundations.v1.json'));
        $this->assertSame('unchanged', $second['status']);
        $this->assertSame(1, MandarinCourseRevision::query()->count());

        $mutated = $this->courseJson();
        $mutated['exercises'][0]['explanation'] = 'changed';
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('different payload');
        $importer->import($mutated);
    }

    public function test_import_rejects_referential_problems_and_leaked_checkpoint_sentences(): void
    {
        $importer = $this->app->make(CourseImporter::class);
        $broken = $this->courseJson();
        $reserved = null;
        foreach ($broken['utterances'] as $utterance) {
            if ($utterance['usage'] === 'checkpoint_reserved') {
                $reserved = $utterance['zh'];
                break;
            }
        }
        $broken['utterances'][0]['zh'] = $reserved;
        $broken['exercises'][0]['correctOptionId'] = 'nope';
        try {
            $importer->import($broken);
            $this->fail('expected validation failure');
        } catch (CourseImportException $exception) {
            $this->assertContains('exercise e001 correct option nope is not one of its options', $exception->problems);
            $this->assertTrue(collect($exception->problems)->contains(fn (string $p): bool => str_contains($p, 'repeats reserved sentence')));
        }
        $this->assertSame(0, MandarinCourseRevision::query()->count());
    }

    public function test_repository_serves_the_published_revision_and_indexes_it(): void
    {
        $this->importCourse();
        $course = $this->app->make(CourseRepository::class)->publishedOrFail();
        $this->assertSame('1.1.1', $course->contentVersion());
        $this->assertCount(20, $course->nodeOrder);
        $this->assertSame('s10n2', $course->nodeOrder[19]);
        $this->assertSame('你好。', $course->speechText('utterance', '01a'));
        $this->assertSame('请', $course->speechText('support', 'please'));
        $this->assertSame('guide', $course->roleFor('utterance', '01a'));
        $this->assertSame('narrator', $course->roleFor('target', 'hello'));
        $this->assertTrue($course->hasSource('sfx', 'ui-tap', 'default'));
        $this->assertFalse($course->hasSource('sfx', 'ui-tap', 'normal'));
        $this->assertTrue($course->hasSource('support', 'please', 'normal'));
        $this->assertTrue($course->hasSource('support', 'please', 'slow'));
        $this->assertFalse($course->hasSource('support', 'missing', 'normal'));
        $this->assertTrue($course->isReservedUtterance('T01'));
    }

    public function test_commands_import_and_validate(): void
    {
        $this->artisan('mandarin:course:import')->assertSuccessful()->expectsOutputToContain('Imported mandarin-foundations@1.1.1');
        $this->artisan('mandarin:course:import')->assertSuccessful()->expectsOutputToContain('Unchanged');
        $this->artisan('mandarin:validate')->assertSuccessful()->expectsOutputToContain('Matches the imported revision');
    }

    public function test_command_can_reactivate_an_already_imported_revision(): void
    {
        $older = $this->courseJson();
        $older['contentVersion'] = '1.0.0';
        $path = storage_path('framework/testing/mandarin-foundations-1.0.0.json');
        file_put_contents($path, json_encode($older, JSON_THROW_ON_ERROR));

        $this->artisan("mandarin:course:import {$path} --activate")->assertSuccessful();
        $this->artisan('mandarin:course:import --stage')->assertSuccessful();
        $this->assertSame('1.0.0', $this->app->make(CourseRepository::class)->publishedOrFail()->contentVersion());
        $this->assertSame('staged', MandarinCourseRevision::query()->where('content_version', '1.1.1')->value('status'));

        $this->artisan('mandarin:course:import --activate')->assertSuccessful();
        $this->assertSame('1.1.1', $this->app->make(CourseRepository::class)->publishedOrFail()->contentVersion());

        $this->artisan("mandarin:course:import {$path} --stage")->assertSuccessful();
        $this->assertSame('1.1.1', $this->app->make(CourseRepository::class)->publishedOrFail()->contentVersion());
        $this->artisan("mandarin:course:import {$path} --activate")
            ->assertSuccessful()
            ->expectsOutputToContain('Activated mandarin-foundations@1.0.0.');
        $this->assertSame('1.0.0', $this->app->make(CourseRepository::class)->publishedOrFail()->contentVersion());
        $this->assertSame('superseded', MandarinCourseRevision::query()->where('content_version', '1.1.1')->value('status'));
    }

    public function test_stage_and_activate_are_mutually_exclusive(): void
    {
        $this->artisan('mandarin:course:import --stage --activate')
            ->assertFailed()
            ->expectsOutputToContain('Pass either --stage or --activate, not both.');
        $this->assertSame(0, MandarinCourseRevision::query()->count());
    }
}
