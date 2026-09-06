<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use Illuminate\Testing\TestResponse;

class PracticeEventsApiTest extends MandarinTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
    }

    private function postEvents(User $user, array $events): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/games/mandarin/events', ['events' => $events]);
    }

    public function test_grades_by_policy_and_never_trusts_client_flags(): void
    {
        $user = User::factory()->create();
        $good = $this->responseEvent(['clientEventId' => 'good', 'correct' => true, 'grade' => 'Easy']);
        $hard = $this->responseEvent(['clientEventId' => 'hard', 'exerciseId' => 'e002', 'selectedOptionId' => $this->correctOption('e002'), 'audioEvidence' => ['status' => 'completed', 'normalPlayCount' => 2, 'slowPlayCount' => 0, 'interrupted' => false]]);
        $again = $this->responseEvent(['clientEventId' => 'again', 'exerciseId' => 'e003', 'selectedOptionId' => $this->correctOption('e003'), 'pinyinHelpUsed' => true]);
        $wrong = $this->responseEvent(['clientEventId' => 'wrong', 'exerciseId' => 'e004', 'selectedOptionId' => $this->wrongOption('e004')]);
        $unscored = $this->responseEvent(['clientEventId' => 'unscored', 'exerciseId' => 'e005', 'selectedOptionId' => $this->correctOption('e005'), 'audioEvidence' => ['status' => 'simulated', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]]);
        $dontKnow = $this->responseEvent(['clientEventId' => 'dk', 'exerciseId' => 'e006', 'responseAction' => 'dont_know', 'selectedOptionId' => null]);
        $extra = $this->responseEvent(['clientEventId' => 'extra', 'exerciseId' => 'e007', 'mode' => 'extra_practice', 'selectedOptionId' => $this->correctOption('e007')]);

        $response = $this->postEvents($user, [$good, $hard, $again, $wrong, $unscored, $dontKnow, $extra])->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $acks = collect($response->json('acknowledgments'))->keyBy('clientEventId');
        $this->assertSame(['accepted', 'correct', 'Good', 1], [$acks['good']['status'], $acks['good']['correctness'], $acks['good']['grade'], $acks['good']['canonicalSequence']]);
        $this->assertSame(['correct', 'Hard'], [$acks['hard']['correctness'], $acks['hard']['grade']]);
        $this->assertSame(['correct', 'Again'], [$acks['again']['correctness'], $acks['again']['grade']]);
        $this->assertSame(['incorrect', 'Again'], [$acks['wrong']['correctness'], $acks['wrong']['grade']]);
        $this->assertSame(['unscored', null], [$acks['unscored']['correctness'], $acks['unscored']['grade']]);
        $this->assertSame(['incorrect', 'Again'], [$acks['dontKnow']['correctness'] ?? $acks['dk']['correctness'], $acks['dk']['grade']]);
        $this->assertSame(['correct', null], [$acks['extra']['correctness'], $acks['extra']['grade']]);
        $this->assertSame(7, $response->json('lastSequence'));
    }

    public function test_idempotent_uploads_conflicts_and_tampering(): void
    {
        $user = User::factory()->create();
        $event = $this->responseEvent(['clientEventId' => 'dup']);
        $this->postEvents($user, [$event])->assertJsonPath('acknowledgments.0.status', 'accepted');
        $this->postEvents($user, [$event])->assertJsonPath('acknowledgments.0.status', 'already_present')->assertJsonPath('acknowledgments.0.canonicalSequence', 1);
        $this->postEvents($user, [array_merge($event, ['selectedOptionId' => 'e001-o2'])])->assertJsonPath('acknowledgments.0.status', 'rejected')->assertJsonPath('acknowledgments.0.reasonCode', 'conflict');
        $this->postEvents($user, [$this->responseEvent(['selectedOptionId' => 'e002-o1'])])->assertJsonPath('acknowledgments.0.reasonCode', 'invalid_option');
        $this->postEvents($user, [$this->responseEvent(['contentVersion' => '0.0.1'])])->assertJsonPath('acknowledgments.0.reasonCode', 'unknown_course_revision');
        $this->postEvents($user, [$this->responseEvent(['exerciseId' => 'nope'])])->assertJsonPath('acknowledgments.0.reasonCode', 'unknown_exercise');
        $this->postEvents($user, [$this->responseEvent(['nodeId' => 'nope'])])->assertJsonPath('acknowledgments.0.reasonCode', 'unknown_node');
        $this->postEvents($user, array_fill(0, 65, $event))->assertStatus(422);
        $this->assertSame(1, MandarinPracticeEvent::query()->count());
    }

    public function test_one_schedule_changing_result_per_target_per_window(): void
    {
        $user = User::factory()->create();
        $first = $this->responseEvent(['clientEventId' => 'w1']);
        $second = $this->responseEvent(['clientEventId' => 'w2', 'exerciseId' => 'e001']);
        $this->postEvents($user, [$first, $second])->assertOk();
        $rows = MandarinPracticeEvent::query()->orderBy('sequence')->get();
        $this->assertTrue($rows[0]->schedule_eligible);
        $this->assertFalse($rows[1]->schedule_eligible, 'immediate repeat is practice, not a second review');
        $this->travel(11)->minutes();
        $this->postEvents($user, [$this->responseEvent(['clientEventId' => 'w3'])]);
        $this->assertTrue(MandarinPracticeEvent::query()->where('client_event_id', 'w3')->firstOrFail()->schedule_eligible);
    }

    public function test_progress_projection_and_account_isolation(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->postEvents($alice, [
            $this->responseEvent(['clientEventId' => 'a1']),
            $this->responseEvent(['clientEventId' => 'a2', 'kind' => 'node_complete', 'exerciseId' => null, 'responseAction' => null, 'selectedOptionId' => null, 'source' => null, 'audioEvidence' => ['status' => 'not_required', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]]),
            $this->responseEvent(['clientEventId' => 'a3', 'kind' => 'checkpoint_exposure', 'mode' => 'checkpoint', 'exerciseId' => 'cp01', 'sceneId' => null, 'nodeId' => null, 'responseAction' => null, 'selectedOptionId' => null, 'source' => null, 'audioEvidence' => ['status' => 'not_required', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]]),
        ])->assertOk();
        $this->postEvents($bob, [$this->responseEvent(['clientEventId' => 'a1'])])->assertJsonPath('acknowledgments.0.status', 'accepted');

        $projection = $this->actingAs($alice)->getJson('/api/games/mandarin/progress')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $projection->assertJsonPath('completedNodeIds', ['s1n1'])
            ->assertJsonPath('currentNodeId', 's1n2')
            ->assertJsonPath('checkpointExposedIds', ['cp01'])
            ->assertJsonPath('lastSequence', 3)
            ->assertJsonPath('listeningCards.reviews.0.targetId', 'hello')
            ->assertJsonPath('listeningCards.reviews.0.grade', 'Good')
            ->assertJsonPath('listeningCards.reviews.0.scheduleEligible', true)
            ->assertJsonCount(1, 'listeningCards.reviews');
        $this->actingAs($bob)->getJson('/api/games/mandarin/progress')->assertJsonPath('completedNodeIds', [])->assertJsonPath('lastSequence', 1);
    }

    private function correctOption(string $exerciseId): string
    {
        foreach ($this->courseJson()['exercises'] as $exercise) {
            if ($exercise['id'] === $exerciseId) {
                return $exercise['correctOptionId'];
            }
        }
        $this->fail("unknown exercise {$exerciseId}");
    }

    private function wrongOption(string $exerciseId): string
    {
        foreach ($this->courseJson()['exercises'] as $exercise) {
            if ($exercise['id'] === $exerciseId) {
                foreach ($exercise['options'] as $option) {
                    if ($option['id'] !== $exercise['correctOptionId']) {
                        return $option['id'];
                    }
                }
            }
        }
        $this->fail("unknown exercise {$exerciseId}");
    }
}
