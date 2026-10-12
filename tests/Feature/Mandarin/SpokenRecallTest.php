<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseImporter;
use App\Services\Games\Mandarin\Course\CourseValidator;
use App\Services\Games\Mandarin\Progress\BaselineReport;
use PHPUnit\Framework\Attributes\DataProvider;

class SpokenRecallTest extends MandarinTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
        $this->app->make(CourseImporter::class)->import($this->recallCourseJson());
    }

    private function recall(array $changes = []): array
    {
        return $this->responseEvent(array_merge([
            'contentVersion' => '1.2.0', 'schemaVersion' => 2, 'attemptIndex' => 0,
            'exerciseId' => 'r01', 'nodeId' => 's1n2', 'responseAction' => 'self_check', 'selfRating' => 'said_it',
            'selectedOptionId' => null, 'sessionKind' => null,
            'source' => ['sourceKind' => 'utterance', 'sourceId' => '01f', 'variant' => 'normal'],
        ], $changes));
    }

    public static function ratings(): array
    {
        return [
            'said it' => [[], 'Good', null],
            'partly' => [['selfRating' => 'partly'], 'Hard', null],
            'missed' => [['selfRating' => 'missed'], 'Again', null],
            'no attempt' => [['responseAction' => 'dont_know', 'selfRating' => null], 'Again', null],
            'not compared' => [['audioEvidence' => ['status' => 'completed', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]], 'Hard', null],
            'failed audio' => [['audioEvidence' => ['status' => 'failed', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]], null, 'unscored'],
            'simulated audio' => [['audioEvidence' => ['status' => 'simulated', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]], null, 'unscored'],
            'skip' => [['responseAction' => 'skip', 'selfRating' => null], null, 'unscored'],
            'retry' => [['attemptIndex' => 1], null, null],
        ];
    }

    #[DataProvider('ratings')]
    public function test_self_ratings_are_guarded_and_never_count_as_verified_comprehension(array $changes, ?string $grade, ?string $correctness): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$this->recall($changes)]])
            ->assertOk()->assertJsonPath('acknowledgments.0.status', 'accepted')
            ->assertJsonPath('acknowledgments.0.grade', $grade)->assertJsonPath('acknowledgments.0.correctness', $correctness);
        $row = MandarinPracticeEvent::query()->sole();
        $this->assertNull($row->target_id);
        $this->assertSame('utterance:01f#form.recall', $row->card_key);
        $this->assertSame($grade !== null, $row->schedule_eligible);
    }

    public function test_listening_and_recall_have_separate_windows_and_history(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [
            $this->responseEvent(['clientEventId' => 'listen']),
            $this->recall(['clientEventId' => 'recall']),
            $this->recall(['clientEventId' => 'same-card', 'opportunityId' => 'opp-2']),
        ]])->assertOk()->assertJsonPath('acknowledgments.1.cardKey', 'utterance:01f#form.recall')
            ->assertJsonPath('acknowledgments.2.cardKey', null);
        $this->assertSame(2, MandarinPracticeEvent::query()->where('schedule_eligible', true)->count());
        $this->getJson('/api/games/mandarin/progress')->assertOk()
            ->assertJsonPath('listeningCards.reviews.0.cardKey', 'target:hello#listen.meaning')
            ->assertJsonPath('listeningCards.reviews.1.cardKey', 'utterance:01f#form.recall')
            ->assertJsonPath('listeningCards.reviews.1.targetId', null);
    }

    public function test_recall_is_allowlisted_and_requires_v2_and_the_correct_activity(): void
    {
        $events = [
            $this->recall(['schemaVersion' => 1]),
            $this->recall(['selfRating' => 'Easy']),
            $this->recall(['responseAction' => 'answer']),
            $this->recall(['nodeId' => 's1n1']),
            $this->recall(['mode' => 'checkpoint']),
            $this->recall(['exerciseId' => 'e001']),
        ];
        $response = $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => $events])->assertOk();
        $response->assertJsonPath('acknowledgments.0.reasonCode', 'unsupported_schema');
        foreach (range(1, 5) as $index) {
            $response->assertJsonPath("acknowledgments.{$index}.reasonCode", 'invalid_payload');
        }
        $this->assertSame(0, MandarinPracticeEvent::query()->count());
    }

    public function test_the_baseline_separates_self_report_and_delayed_claims_from_listening(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$this->recall()]])->assertOk();
        $this->travel(3)->days();
        $this->postJson('/api/games/mandarin/events', ['events' => [$this->recall(['opportunityId' => 'later', 'selfRating' => 'missed'])]])->assertOk();
        $report = $this->app->make(BaselineReport::class)->build('mandarin-foundations')['total'];
        $this->assertSame(0, $report['comprehension']['unaided']['n']);
        $this->assertSame(1, $report['spokenRecall']['ratings']['said_it']);
        $this->assertSame(1, $report['spokenRecall']['ratings']['missed']);
        $this->assertSame(['n' => 1, 'correct' => 0, 'rate' => 0.0], $report['spokenRecall']['afterEarlierGood']['oneToSevenDays']);
    }

    public function test_course_validation_requires_the_matching_skill_and_teaching_without_exposing_checkpoint_items(): void
    {
        $validator = $this->app->make(CourseValidator::class);
        $course = $this->recallCourseJson();
        $this->assertSame([], $validator->validate($course));
        $course['recallExercises'][0]['assesses']['id'] = '02c';
        $this->assertContains('recall r01 assesses a different utterance', $validator->validate($course));
        $course = $this->recallCourseJson();
        $course['recallExercises'][0]['sourceUtteranceId'] = $course['checkpointExercises'][0]['promptAudio'][0]['sourceId'];
        $this->assertContains('recall r01 requires a taught, non-reserved utterance in its node', $validator->validate($course));
        $course = $this->recallCourseJson();
        $course['recallExercises'][0]['assesses']['skill'] = 'listen.meaning';
        $this->assertContains('recall must declare an utterance form.recall skill', $validator->validate($course));
    }
}
