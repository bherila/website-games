<?php

namespace Tests\Feature;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\User;
use App\Models\UserGameData;
use App\Rules\ValidGameDataPayload;
use App\Services\Games\GameDataMerger;
use App\Services\Games\GameDataStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class GameDataHardeningTest extends TestCase
{
    use RefreshDatabase;

    /** @param array<string, mixed> $data */
    #[DataProvider('invalidProtectedMetricProvider')]
    public function test_protected_progress_metrics_require_bounded_integers(array $data): void
    {
        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/chicks-challenge/data/profile/default', ['data' => $data])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');
    }

    public function test_valid_protected_metric_boundaries_are_accepted_recursively(): void
    {
        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/chicks-challenge/data/profile/default', [
                'data' => [
                    'nested' => [
                        'stars' => 0,
                        'score' => 0,
                        'clears' => 0,
                        'unlockedLevel' => 1,
                        'bestMoves' => 1,
                    ],
                ],
            ])
            ->assertOk();
    }

    public function test_profile_and_level_payloads_are_limited_to_eight_kibibytes(): void
    {
        $user = User::factory()->create();
        $oversizedData = ['blob' => str_repeat('x', ValidGameDataPayload::PROGRESS_MAX_ENCODED_BYTES)];

        $this->actingAs($user)
            ->putJson('/api/games/marble-sort/data/profile/default', ['data' => $oversizedData])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)
            ->putJson('/api/games/marble-sort/data', [
                'operations' => [[
                    'action' => 'put',
                    'scope' => 'level',
                    'slot' => '1',
                    'revision' => null,
                    'data' => $oversizedData,
                ]],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('operations.0.data');
    }

    public function test_save_payloads_use_the_larger_snapshot_limit_in_single_and_batch_requests(): void
    {
        $snapshotData = ['snapshot' => str_repeat('x', ValidGameDataPayload::PROGRESS_MAX_ENCODED_BYTES)];

        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/marble-sort/data/save/autosave', ['data' => $snapshotData])
            ->assertOk();

        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/marble-sort/data', [
                'operations' => [[
                    'action' => 'put',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => null,
                    'data' => $snapshotData,
                ]],
            ])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'saved');

        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/marble-sort/data/save/autosave', [
                'data' => ['snapshot' => str_repeat('x', ValidGameDataPayload::SAVE_MAX_ENCODED_BYTES)],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');
    }

    public function test_stale_save_batch_preserves_snapshot_and_inventory_but_keeps_monotonic_progress(): void
    {
        $user = User::factory()->create();
        $save = UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => ['version' => 2, 'state' => ['moves' => 10]],
            'revision' => 4,
        ]);
        $inventory = UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Profile,
            'slot' => 'inventory',
            'data' => ['version' => 2, 'powerups' => ['undo' => 3]],
            'revision' => 7,
        ]);

        $this->actingAs($user)->putJson('/api/games/marble-sort/data', [
            'operations' => [
                [
                    'action' => 'put',
                    'scope' => 'profile',
                    'slot' => 'default',
                    'revision' => null,
                    'data' => ['version' => 2, 'unlocked_level' => 2, 'total_score' => 500],
                ],
                [
                    'action' => 'put',
                    'scope' => 'profile',
                    'slot' => 'inventory',
                    'revision' => 7,
                    'data' => ['version' => 2, 'powerups' => ['undo' => 99]],
                ],
                [
                    'action' => 'put',
                    'scope' => 'level',
                    'slot' => '1',
                    'revision' => null,
                    'data' => ['version' => 2, 'stars' => 3, 'score' => 500],
                ],
                [
                    'action' => 'delete',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => 3,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.1.status', 'stale')
            ->assertJsonPath('data.2.status', 'saved')
            ->assertJsonPath('data.3.status', 'stale');

        $this->assertSame(['version' => 2, 'state' => ['moves' => 10]], $save->refresh()->data);
        $this->assertSame(4, $save->revision);
        $this->assertSame(['version' => 2, 'powerups' => ['undo' => 3]], $inventory->refresh()->data);
        $this->assertSame(7, $inventory->revision);
        $this->assertDatabaseHas('user_game_data', [
            'user_id' => $user->id,
            'game' => GameSlug::MarbleSort->value,
            'scope' => GameDataScope::Profile->value,
            'slot' => 'default',
        ]);
        $this->assertDatabaseHas('user_game_data', [
            'user_id' => $user->id,
            'game' => GameSlug::MarbleSort->value,
            'scope' => GameDataScope::Level->value,
            'slot' => '1',
        ]);
    }

    public function test_missing_save_delete_without_revision_is_idempotent_but_known_revision_is_stale(): void
    {
        $idempotentUser = User::factory()->create();

        $this->actingAs($idempotentUser)->putJson('/api/games/marble-sort/data', [
            'operations' => [
                [
                    'action' => 'put',
                    'scope' => 'profile',
                    'slot' => 'inventory',
                    'revision' => null,
                    'data' => ['version' => 2, 'powerups' => ['undo' => 1]],
                ],
                [
                    'action' => 'delete',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => null,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.1.status', 'missing');

        $staleUser = User::factory()->create();

        $this->actingAs($staleUser)->putJson('/api/games/marble-sort/data', [
            'operations' => [
                [
                    'action' => 'put',
                    'scope' => 'profile',
                    'slot' => 'inventory',
                    'revision' => null,
                    'data' => ['version' => 2, 'powerups' => ['undo' => 1]],
                ],
                [
                    'action' => 'delete',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => 4,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'stale')
            ->assertJsonPath('data.1.status', 'stale');

        $this->assertDatabaseMissing('user_game_data', [
            'user_id' => $staleUser->id,
            'game' => GameSlug::MarbleSort->value,
            'scope' => GameDataScope::Profile->value,
            'slot' => 'inventory',
        ]);
    }

    public function test_batch_operations_must_have_unique_ordered_addresses_and_known_control_fields(): void
    {
        $user = User::factory()->create();
        $operation = [
            'action' => 'put',
            'scope' => 'level',
            'slot' => '1',
            'revision' => null,
            'data' => ['version' => 1, 'stars' => 2],
        ];

        $this->actingAs($user)->putJson('/api/games/chicks-challenge/data', [
            'operations' => ['first' => $operation],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations');

        $this->actingAs($user)->putJson('/api/games/chicks-challenge/data', [
            'operations' => [$operation, $operation],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations.1.slot');

        $this->actingAs($user)->putJson('/api/games/chicks-challenge/data', [
            'operations' => [[...$operation, 'unexpected' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations.0');

        $this->actingAs($user)->putJson('/api/games/chicks-challenge/data', [
            'operations' => [[...$operation, 'scope' => ['level']]],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations.0.scope');

        $this->actingAs($user)->putJson('/api/games/marble-sort/data', [
            'operations' => [[
                'action' => 'delete',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'data' => ['ignored' => true],
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations.0.data');
    }

    public function test_batch_writes_roll_back_together_when_an_operation_fails(): void
    {
        $user = User::factory()->create();
        $merger = new class extends GameDataMerger
        {
            private int $calls = 0;

            /**
             * @param  array<mixed>  $existing
             * @param  array<mixed>  $incoming
             * @return array<mixed>
             */
            public function merge(array $existing, array $incoming): array
            {
                $this->calls++;
                if ($this->calls === 2) {
                    throw new RuntimeException('Simulated later operation failure.');
                }

                return parent::merge($existing, $incoming);
            }
        };
        $store = new GameDataStore($merger);

        try {
            $store->batch($user, GameSlug::ChicksChallenge, [
                [
                    'action' => 'put',
                    'scope' => GameDataScope::Profile,
                    'slot' => 'default',
                    'data' => ['version' => 1, 'unlocked_level' => 2],
                    'revision' => null,
                ],
                [
                    'action' => 'put',
                    'scope' => GameDataScope::Level,
                    'slot' => '1',
                    'data' => ['version' => 1, 'stars' => 3],
                    'revision' => null,
                ],
            ]);
            $this->fail('The simulated failure should escape the transaction.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated later operation failure.', $exception->getMessage());
        }

        $this->assertDatabaseMissing('user_game_data', ['user_id' => $user->id]);
    }

    public function test_writer_put_retries_are_idempotent_and_later_sequences_win_after_response_loss(): void
    {
        $user = User::factory()->create();
        $writerId = '11111111-1111-4111-8111-111111111111';
        $url = '/api/games/marble-sort/data';

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 8, 'level' => 1]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 1);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => 1,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 7, 'level' => 1]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'stale')
            ->assertJsonPath('data.0.row.revision', 1)
            ->assertJsonPath('data.0.row.data.state.moves', 8);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['state' => ['level' => 1, 'moves' => 8], 'version' => 2],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 1);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => 0,
                'writer_id' => $writerId,
                'writer_sequence' => 2,
                'data' => ['version' => 2, 'state' => ['moves' => 6, 'level' => 1]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.data.state.moves', 6);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => 1,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 8, 'level' => 1]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'superseded')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.data.state.moves', 6);

        $this->assertSame(2, UserGameData::query()->where('user_id', $user->id)->sole()->revision);
    }

    public function test_active_writer_delete_retry_is_idempotent_and_later_put_resurrects(): void
    {
        $user = User::factory()->create();
        $writerId = '11111111-1111-4111-8111-111111111111';
        $url = '/api/games/marble-sort/data';

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 8]],
            ]],
        ])->assertOk()->assertJsonPath('data.0.row.revision', 1);

        $delete = [
            'action' => 'delete',
            'scope' => 'save',
            'slot' => 'autosave',
            'revision' => 1,
            'writer_id' => $writerId,
            'writer_sequence' => 2,
        ];
        $deleteResponse = $this->actingAs($user)->putJson($url, ['operations' => [$delete]]);
        $deleteResponse->assertOk()
            ->assertJsonPath('data.0.status', 'deleted')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.is_deleted', true);
        $this->assertStringContainsString('"data":{}', (string) $deleteResponse->getContent());

        $this->actingAs($user)->putJson($url, ['operations' => [$delete]])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'deleted')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.is_deleted', true);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $writerId,
                'writer_sequence' => 3,
                'data' => ['version' => 2, 'state' => ['moves' => 3]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 3)
            ->assertJsonPath('data.0.row.is_deleted', false)
            ->assertJsonPath('data.0.row.data.state.moves', 3);
    }

    public function test_writer_delete_tombstone_orders_missing_slot_retries_and_resurrection(): void
    {
        $user = User::factory()->create();
        $writerId = '11111111-1111-4111-8111-111111111111';
        $otherWriterId = '22222222-2222-4222-8222-222222222222';
        $url = '/api/games/marble-sort/data';
        $delete = [
            'action' => 'delete',
            'scope' => 'save',
            'slot' => 'autosave',
            'revision' => null,
            'writer_id' => $writerId,
            'writer_sequence' => 2,
        ];

        $this->actingAs($user)->putJson($url, ['operations' => [$delete]])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'deleted')
            ->assertJsonPath('data.0.row.revision', 1)
            ->assertJsonPath('data.0.row.is_deleted', true);

        $this->actingAs($user)->putJson($url, ['operations' => [$delete]])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'deleted')
            ->assertJsonPath('data.0.row.revision', 1);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $writerId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 9]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'superseded')
            ->assertJsonPath('data.0.row.is_deleted', true);

        $this->actingAs($user)->getJson('/api/games/data?games[]=marble-sort&include_saves=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.scope', 'save')
            ->assertJsonPath('data.0.revision', 1)
            ->assertJsonPath('data.0.is_deleted', true);

        $this->actingAs($user)->getJson('/api/games/data?games[]=marble-sort&include_saves=0')
            ->assertOk()
            ->assertExactJson(['data' => []]);

        $this->actingAs($user)->putJson($url, [
            'operations' => [[
                'action' => 'put',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => $otherWriterId,
                'writer_sequence' => 1,
                'data' => ['version' => 2, 'state' => ['moves' => 4]],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.is_deleted', false);
    }

    public function test_other_writer_cannot_bypass_active_save_revision_conflicts(): void
    {
        $user = User::factory()->create();
        $firstWriterId = '11111111-1111-4111-8111-111111111111';
        $secondWriterId = '22222222-2222-4222-8222-222222222222';
        $url = '/api/games/parking-pickup/data';

        $this->actingAs($user)->putJson($url, [
            'operations' => [$this->savePutOperation($firstWriterId, 1, null, 8)],
        ])->assertOk()->assertJsonPath('data.0.status', 'saved');

        $this->actingAs($user)->putJson($url, [
            'operations' => [$this->savePutOperation($secondWriterId, 1, null, 4)],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'stale')
            ->assertJsonPath('data.0.row.revision', 1)
            ->assertJsonPath('data.0.row.data.state.moves', 8);

        $this->actingAs($user)->putJson($url, [
            'operations' => [$this->savePutOperation($secondWriterId, 1, 1, 4)],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.0.row.revision', 2);

        $this->actingAs($user)->putJson($url, [
            'operations' => [$this->savePutOperation($firstWriterId, 2, 1, 2)],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'stale')
            ->assertJsonPath('data.0.row.revision', 2)
            ->assertJsonPath('data.0.row.data.state.moves', 4);
    }

    public function test_superseded_save_batch_does_not_apply_older_inventory(): void
    {
        $user = User::factory()->create();
        $writerId = '11111111-1111-4111-8111-111111111111';
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => ['version' => 2, 'state' => ['moves' => 5]],
            'revision' => 5,
            'writer_id' => $writerId,
            'writer_sequence' => 5,
        ]);
        $inventory = UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Profile,
            'slot' => 'inventory',
            'data' => ['version' => 2, 'powerups' => ['undo' => 3]],
            'revision' => 7,
        ]);

        $this->actingAs($user)->putJson('/api/games/marble-sort/data', [
            'operations' => [
                [
                    'action' => 'put',
                    'scope' => 'profile',
                    'slot' => 'inventory',
                    'revision' => 7,
                    'data' => ['version' => 2, 'powerups' => ['undo' => 99]],
                ],
                [
                    'action' => 'put',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => 5,
                    'writer_id' => $writerId,
                    'writer_sequence' => 4,
                    'data' => ['version' => 2, 'state' => ['moves' => 9]],
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'superseded')
            ->assertJsonPath('data.0.row.revision', 7)
            ->assertJsonPath('data.1.status', 'superseded')
            ->assertJsonPath('data.1.row.revision', 5);

        $this->assertSame(['version' => 2, 'powerups' => ['undo' => 3]], $inventory->refresh()->data);
    }

    public function test_writer_ordering_fields_are_paired_valid_uuids_and_save_only(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/games/marble-sort/data/save/autosave', [
            'data' => ['version' => 2],
            'writer_sequence' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('writer_id');

        $this->actingAs($user)->putJson('/api/games/marble-sort/data/save/autosave', [
            'data' => ['version' => 2],
            'writer_id' => 'not-a-uuid',
            'writer_sequence' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('writer_id');

        $this->actingAs($user)->putJson('/api/games/marble-sort/data/profile/default', [
            'data' => ['version' => 2],
            'writer_id' => '11111111-1111-4111-8111-111111111111',
            'writer_sequence' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('writer_id');

        $this->actingAs($user)->putJson('/api/games/marble-sort/data', [
            'operations' => [[
                'action' => 'delete',
                'scope' => 'save',
                'slot' => 'autosave',
                'revision' => null,
                'writer_id' => '11111111-1111-4111-8111-111111111111',
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors('operations.0.writer_id');
    }

    /**
     * @return array{action: 'put', scope: 'save', slot: 'autosave', revision: int|null, writer_id: string, writer_sequence: int, data: array{version: 3, state: array{moves: int}}}
     */
    private function savePutOperation(string $writerId, int $writerSequence, ?int $revision, int $moves): array
    {
        return [
            'action' => 'put',
            'scope' => 'save',
            'slot' => 'autosave',
            'revision' => $revision,
            'writer_id' => $writerId,
            'writer_sequence' => $writerSequence,
            'data' => ['version' => 3, 'state' => ['moves' => $moves]],
        ];
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function invalidProtectedMetricProvider(): iterable
    {
        yield 'stars below zero' => [['stars' => -1]];
        yield 'stars above three' => [['stars' => 4]];
        yield 'stars must be an integer' => [['stars' => 2.5]];
        yield 'score below zero' => [['score' => -1]];
        yield 'score must be an integer' => [['score' => 1.5]];
        yield 'score above JavaScript safe integer' => [['score' => 9_007_199_254_740_992]];
        yield 'clears below zero' => [['clears' => -1]];
        yield 'map clears must be an integer' => [['mapsCleared' => 1.5]];
        yield 'round index below zero' => [['bestRoundIndex' => -1]];
        yield 'unlocked level starts at one' => [['unlockedLevel' => 0]];
        yield 'best moves starts at one' => [['nested' => ['best_moves' => 0]]];
        yield 'numeric strings are rejected' => [['highScore' => '100']];
    }
}
