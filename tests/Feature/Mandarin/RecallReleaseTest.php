<?php

namespace Tests\Feature\Mandarin;

use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseImporter;

class RecallReleaseTest extends MandarinTestCase
{
    public function test_the_activated_revision_keeps_legacy_progress_and_serves_five_recall_activities(): void
    {
        $this->importCourse();
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$this->responseEvent()]])->assertOk();
        $source = resource_path('data/mandarin/foundations.v2.json');
        config()->set('mandarin.course.source', $source);
        $importer = $this->app->make(CourseImporter::class);
        $revision = $importer->importFile($source, false)['revision'];
        $importer->activate($revision);
        $this->getJson('/api/games/mandarin/bootstrap')->assertOk()
            ->assertJsonPath('course.schemaVersion', 2)->assertJsonPath('course.contentVersion', '1.2.0')
            ->assertJsonCount(5, 'course.recallExercises')->assertJsonCount(50, 'course.targets')
            ->assertJsonCount(20, 'course.checkpointExercises')->assertJsonPath('capabilities.practiceEventSchemas', [1, 2]);
        $this->getJson('/api/games/mandarin/progress')->assertOk()
            ->assertJsonPath('contentVersion', '1.2.0')
            ->assertJsonPath('listeningCards.reviews.0.cardKey', 'target:hello#listen.meaning');
    }

    public function test_the_new_revision_changes_no_chinese_or_recordings_and_has_all_revision_mappings(): void
    {
        $old = $this->courseJson();
        $new = json_decode((string) file_get_contents(resource_path('data/mandarin/foundations.v2.json')), true, 512, JSON_THROW_ON_ERROR);
        foreach (['utterances', 'targets', 'supportGlossary', 'exercises', 'constructionExercises', 'checkpointExercises', 'scenes', 'nodes', 'roles', 'sfx'] as $field) {
            $this->assertSame($old[$field], $new[$field], $field);
        }
        $this->assertSame($old['provenance']['nativeReviewed'], $new['provenance']['nativeReviewed']);
        $this->assertSame($old['provenance']['audioAuditioned'], $new['provenance']['audioAuditioned']);
        $manifest = json_decode((string) file_get_contents(resource_path('data/mandarin/audio-manifest.json')), true, 512, JSON_THROW_ON_ERROR);
        $this->assertCount(314, $manifest['assets']);
        $mappings = [];
        foreach ($manifest['sources'] as $row) {
            $key = $row['source_kind'].':'.$row['source_id'].':'.$row['variant'];
            $mappings[$row['content_version']][$key] = $row['recipe_hash'];
        }
        $this->assertCount(316, $mappings['1.2.0']);
        ksort($mappings['1.1.1']);
        ksort($mappings['1.2.0']);
        $this->assertSame($mappings['1.1.1'], $mappings['1.2.0']);
    }
}
