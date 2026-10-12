<?php

namespace Tests\Feature\Mandarin;

use App\Models\Mandarin\MandarinPracticeEvent;
use App\Models\User;
use App\Services\Games\Mandarin\Course\CourseValidator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\DataProvider;

class PracticeEventSchemaTest extends MandarinTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCourse();
    }

    /** @return array<string, mixed> */
    private function v2(array $changes = []): array
    {
        return $this->responseEvent(array_merge([
            'schemaVersion' => 2, 'attemptIndex' => 0, 'selfRating' => null, 'sessionKind' => null,
        ], $changes));
    }

    public static function legacyGrades(): array
    {
        return [
            'unaided' => [[], 'correct', 'Good', true, 'hello'],
            'replay' => [['audioEvidence' => ['status' => 'completed', 'normalPlayCount' => 2, 'slowPlayCount' => 0]], 'correct', 'Hard', true, 'hello'],
            'slow' => [['audioEvidence' => ['status' => 'completed', 'normalPlayCount' => 0, 'slowPlayCount' => 1]], 'correct', 'Hard', true, 'hello'],
            'meaning help' => [['textHelpUsed' => true], 'correct', 'Again', true, 'hello'],
            'pinyin help' => [['pinyinHelpUsed' => true], 'correct', 'Again', true, 'hello'],
            'wrong' => [['selectedOptionId' => 'e001-o2'], 'incorrect', 'Again', true, 'hello'],
            'unknown' => [['responseAction' => 'dont_know', 'selectedOptionId' => null], 'incorrect', 'Again', true, 'hello'],
            'skip' => [['responseAction' => 'skip'], 'unscored', null, false, 'hello'],
            'failed audio' => [['audioEvidence' => ['status' => 'failed']], 'unscored', null, false, 'hello'],
            'preview audio' => [['audioEvidence' => ['status' => 'simulated']], 'unscored', null, false, 'hello'],
            'extra practice' => [['mode' => 'extra_practice'], 'correct', null, false, 'hello'],
            'preview' => [['mode' => 'preview'], 'correct', null, false, 'hello'],
            'review' => [['mode' => 'review'], 'correct', 'Good', true, 'hello'],
            'nonresponse' => [['kind' => 'teaching_exposure'], null, null, false, null],
            'client grade ignored' => [['grade' => 'Easy', 'correctness' => 'incorrect', 'cardKey' => 'forged'], 'correct', 'Good', true, 'hello'],
        ];
    }

    #[DataProvider('legacyGrades')]
    public function test_v1_grading_is_frozen(array $changes, ?string $correctness, ?string $grade, bool $eligible, ?string $target): void
    {
        $user = User::factory()->create();
        $event = $this->responseEvent($changes);
        $this->actingAs($user)->postJson('/api/games/mandarin/events', ['events' => [$event]])
            ->assertOk()->assertJsonPath('acknowledgments.0.status', 'accepted')
            ->assertJsonPath('acknowledgments.0.correctness', $correctness)
            ->assertJsonPath('acknowledgments.0.grade', $grade)
            ->assertJsonPath('acknowledgments.0.cardKey', $eligible ? 'target:hello#listen.meaning' : null);
        $row = MandarinPracticeEvent::query()->sole();
        $this->assertSame([$correctness, $grade, $eligible, $target, 1], [$row->correctness, $row->grade, $row->schedule_eligible, $row->target_id, $row->schema_version]);
        $this->assertSame(CourseValidator::canonicalJson($event), $row->payload);
        $this->assertSame(hash('sha256', $row->payload), $row->payload_hash);
    }

    public function test_v1_and_v2_share_the_card_window_but_retries_never_move_it(): void
    {
        $user = User::factory()->create();
        $first = $this->responseEvent(['clientEventId' => 'legacy']);
        $v2 = $this->v2(['clientEventId' => 'new', 'opportunityId' => 'new-opportunity']);
        $this->actingAs($user)->postJson('/api/games/mandarin/events', ['events' => [$first, $v2]])
            ->assertOk()->assertJsonPath('acknowledgments.0.cardKey', 'target:hello#listen.meaning')
            ->assertJsonPath('acknowledgments.1.cardKey', null);
        $this->assertFalse(MandarinPracticeEvent::query()->where('client_event_id', 'new')->sole()->schedule_eligible);
        $this->travel(11)->minutes();
        $retry = $this->v2(['clientEventId' => 'retry', 'opportunityId' => 'new-opportunity', 'attemptIndex' => 1]);
        $forgedFirst = $this->v2(['clientEventId' => 'forged-first', 'opportunityId' => 'new-opportunity']);
        $fresh = $this->v2(['clientEventId' => 'fresh', 'opportunityId' => 'fresh-opportunity']);
        $this->postJson('/api/games/mandarin/events', ['events' => [$retry, $forgedFirst, $fresh]])
            ->assertOk()->assertJsonPath('acknowledgments.0.correctness', 'correct')
            ->assertJsonPath('acknowledgments.0.grade', null)
            ->assertJsonPath('acknowledgments.1.cardKey', null)
            ->assertJsonPath('acknowledgments.2.cardKey', 'target:hello#listen.meaning');
        $this->getJson('/api/games/mandarin/progress')->assertOk()
            ->assertJsonPath('listeningCards.reviews.0.targetId', 'hello')
            ->assertJsonPath('listeningCards.reviews.0.cardKey', 'target:hello#listen.meaning');
        $this->postJson('/api/games/mandarin/events', ['events' => [$first]])
            ->assertJsonPath('acknowledgments.0.status', 'already_present');
        $this->postJson('/api/games/mandarin/events', ['events' => [array_merge($first, ['schemaVersion' => 2, 'attemptIndex' => 0])]])
            ->assertJsonPath('acknowledgments.0.reasonCode', 'conflict');
    }

    public static function invalidV2Fields(): array
    {
        return [
            'missing attempt' => [['attemptIndex' => null]],
            'negative attempt' => [['attemptIndex' => -1]],
            'string attempt' => [['attemptIndex' => '0']],
            'missing opportunity' => [['opportunityId' => null]],
            'nonstring scene' => [['sceneId' => ['s1']]],
            'relative date' => [['clientOccurredAt' => 'tomorrow']],
            'missing offset' => [['clientOccurredAt' => '2026-10-12T10:00:00']],
            'overflowing date' => [['clientOccurredAt' => '2026-02-30T10:00:00Z']],
            'wrong help type' => [['textHelpUsed' => 'false']],
            'self rating on listening' => [['selfRating' => 'said_it']],
            'session on lesson' => [['sessionKind' => 'scheduled']],
            'missing review session' => [['mode' => 'review']],
            'extra session on review' => [['mode' => 'review', 'sessionKind' => 'extra']],
            'scheduled extra practice' => [['mode' => 'extra_practice', 'sessionKind' => 'scheduled']],
            'negative audio count' => [['audioEvidence' => ['status' => 'completed', 'normalPlayCount' => -1, 'slowPlayCount' => 0, 'interrupted' => false]]],
        ];
    }

    #[DataProvider('invalidV2Fields')]
    public function test_v2_validates_changed_fields_per_event(array $changes): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$this->v2($changes), $this->v2()]])
            ->assertOk()->assertJsonPath('acknowledgments.0.reasonCode', 'invalid_payload')
            ->assertJsonPath('acknowledgments.1.status', 'accepted');
        $this->assertSame(1, MandarinPracticeEvent::query()->count());
    }

    public function test_supported_v2_sessions_help_and_construction(): void
    {
        $construction = $this->courseJson()['constructionExercises'][0];
        $events = [
            $this->v2(['clientEventId' => 'scheduled', 'mode' => 'review', 'sessionKind' => 'scheduled']),
            $this->v2(['clientEventId' => 'continuation', 'mode' => 'review', 'sessionKind' => 'continuation']),
            $this->v2(['clientEventId' => 'extra', 'mode' => 'extra_practice', 'sessionKind' => 'extra']),
            $this->v2(['clientEventId' => 'help', 'textHelpUsed' => true]),
            $this->v2(['clientEventId' => 'construction', 'exerciseId' => $construction['id'], 'selectedOptionId' => null, 'orderedTileIds' => $construction['correctTileIds'], 'audioEvidence' => ['status' => 'not_required', 'normalPlayCount' => 0, 'slowPlayCount' => 0, 'interrupted' => false]]),
        ];
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => $events])->assertOk()
            ->assertJsonPath('acknowledgments.0.grade', 'Good')
            ->assertJsonPath('acknowledgments.1.grade', 'Good')
            ->assertJsonPath('acknowledgments.2.grade', null)
            ->assertJsonPath('acknowledgments.3.grade', 'Again')
            ->assertJsonPath('acknowledgments.4.correctness', 'correct')
            ->assertJsonPath('acknowledgments.4.grade', null);
    }

    public function test_unknown_v2_kinds_are_retryable_and_rejection_logs_contain_only_safe_labels(): void
    {
        Log::spy();
        $event = $this->v2(['kind' => 'future-kind-with-private-text']);
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$event]])
            ->assertOk()->assertJsonPath('acknowledgments.0.reasonCode', 'unsupported_kind');
        Log::shouldHaveReceived('notice')->once()->with('Mandarin practice event rejected', [
            'reason' => 'unsupported_kind', 'schemaVersion' => 2, 'kind' => 'unsupported',
        ]);
        $this->assertSame(0, MandarinPracticeEvent::query()->count());
    }

    public function test_backfill_preserves_payloads_hashes_and_the_legacy_window(): void
    {
        $user = User::factory()->create();
        $legacy = $this->responseEvent(['clientEventId' => 'before-upgrade']);
        $this->actingAs($user)->postJson('/api/games/mandarin/events', ['events' => [$legacy]])->assertOk();
        $row = MandarinPracticeEvent::query()->sole();
        $migration = require database_path('migrations/2026_10_12_000001_add_mandarin_event_schema_and_card_key.php');
        $migration->down();
        $migration->up();
        $backfilled = DB::table('mandarin_practice_events')->where('id', $row->id)->first();
        $this->assertSame('target:hello#listen.meaning', $backfilled->card_key);
        $this->assertSame(1, $backfilled->schema_version);
        $this->assertSame($row->payload, $backfilled->payload);
        $this->assertSame($row->payload_hash, $backfilled->payload_hash);
        $this->postJson('/api/games/mandarin/events', ['events' => [$legacy]])->assertJsonPath('acknowledgments.0.status', 'already_present');
        $this->postJson('/api/games/mandarin/events', ['events' => [$this->v2()]])
            ->assertJsonPath('acknowledgments.0.cardKey', null);
    }

    public function test_rows_written_by_old_code_during_a_rollback_keep_their_card_window_and_projection(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/games/mandarin/events', ['events' => [$this->responseEvent()]])->assertOk();
        // Old code ignores card_key, and the migration default still records v1.
        MandarinPracticeEvent::query()->update(['card_key' => null]);
        $this->getJson('/api/games/mandarin/progress')
            ->assertJsonPath('listeningCards.reviews.0.cardKey', 'target:hello#listen.meaning');
        $this->postJson('/api/games/mandarin/events', ['events' => [$this->v2(['opportunityId' => 'fresh-opportunity'])]])
            ->assertJsonPath('acknowledgments.0.cardKey', null);
        $this->assertSame(1, MandarinPracticeEvent::query()->where('schedule_eligible', true)->count());
    }
}
