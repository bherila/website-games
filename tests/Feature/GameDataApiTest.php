<?php

namespace Tests\Feature;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\User;
use App\Models\UserGameData;
use App\Rules\ValidGameDataPayload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameDataApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_game_data_endpoints(): void
    {
        $this->getJson('/api/games/data')->assertUnauthorized();
        $this->putJson('/api/games/chicks-challenge/data/profile/default', [
            'data' => ['unlocked_level' => 2],
        ])->assertUnauthorized();
        $this->putJson('/api/games/chicks-challenge/data', [
            'operations' => [],
        ])->assertUnauthorized();
        $this->deleteJson('/api/games/chicks-challenge/data/profile/default')->assertUnauthorized();
    }

    public function test_index_is_empty_for_user_without_saved_game_data(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/games/data')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_profile_upsert_merges_data_and_preserves_better_metrics(): void
    {
        $user = User::factory()->create();
        $url = '/api/games/chicks-challenge/data/profile/default';

        $this->actingAs($user)->putJson($url, [
            'data' => [
                'score' => 100,
                'stars' => 3,
                'best_moves' => 12,
                'unlockedLevel' => 5,
                'nested' => ['highScore' => 50],
                'difficulty' => 'easy',
            ],
        ])->assertOk()
            ->assertJsonPath('data.game', 'chicks-challenge')
            ->assertJsonPath('data.scope', 'profile')
            ->assertJsonPath('data.slot', 'default')
            ->assertJsonStructure(['data' => ['created_at', 'updated_at']]);

        $this->actingAs($user)->putJson($url, [
            'data' => [
                'score' => 80,
                'stars' => 2,
                'best_moves' => 15,
                'unlockedLevel' => 4,
                'nested' => ['highScore' => 45, 'label' => 'new'],
                'difficulty' => 'hard',
                'lives' => 2,
            ],
        ])->assertOk()
            ->assertJsonPath('data.data.score', 100)
            ->assertJsonPath('data.data.stars', 3)
            ->assertJsonPath('data.data.best_moves', 12)
            ->assertJsonPath('data.data.unlockedLevel', 5)
            ->assertJsonPath('data.data.nested.highScore', 50)
            ->assertJsonPath('data.data.nested.label', 'new')
            ->assertJsonPath('data.data.difficulty', 'hard')
            ->assertJsonPath('data.data.lives', 2);

        $this->assertSame(1, UserGameData::query()->where('user_id', $user->id)->count());
    }

    public function test_level_rows_are_upserted_independently(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/games/block-blaster/data/level/1', [
            'data' => ['score' => 400, 'stars' => 2],
        ])->assertOk();
        $this->actingAs($user)->putJson('/api/games/block-blaster/data/level/2', [
            'data' => ['score' => 250, 'stars' => 1],
        ])->assertOk();
        $this->actingAs($user)->putJson('/api/games/block-blaster/data/level/1', [
            'data' => ['score' => 450, 'stars' => 3],
        ])->assertOk();

        $rows = UserGameData::query()
            ->where('user_id', $user->id)
            ->where('game', GameSlug::BlockBlaster)
            ->where('scope', GameDataScope::Level)
            ->orderBy('slot')
            ->get();

        $this->assertCount(2, $rows);
        $this->assertSame(['score' => 450, 'stars' => 3], $rows[0]->data);
        $this->assertSame(['score' => 250, 'stars' => 1], $rows[1]->data);
    }

    public function test_save_scope_replaces_the_slot_payload(): void
    {
        $user = User::factory()->create();
        $url = '/api/games/marble-sort/data/save/autosave';

        $this->actingAs($user)->putJson($url, [
            'data' => ['score' => 500, 'board' => [1, 2, 3]],
        ])->assertOk();

        $this->actingAs($user)->putJson($url, [
            'data' => ['score' => 100, 'board' => [4, 5]],
            'revision' => 1,
        ])->assertOk()
            ->assertJsonPath('data.data.score', 100)
            ->assertJsonPath('data.data.board', [4, 5]);
    }

    public function test_batch_saves_completion_rows_before_deleting_the_autosave_in_one_transaction(): void
    {
        $user = User::factory()->create();
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => ['version' => 2, 'state' => ['moves' => 10]],
            'revision' => 4,
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
                    'scope' => 'level',
                    'slot' => '1',
                    'revision' => null,
                    'data' => ['version' => 2, 'stars' => 3, 'score' => 500],
                ],
                [
                    'action' => 'delete',
                    'scope' => 'save',
                    'slot' => 'autosave',
                    'revision' => 4,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'saved')
            ->assertJsonPath('data.1.status', 'saved')
            ->assertJsonPath('data.2.status', 'deleted');

        $this->assertDatabaseHas('user_game_data', [
            'user_id' => $user->id,
            'game' => GameSlug::MarbleSort->value,
            'scope' => GameDataScope::Level->value,
            'slot' => '1',
        ]);
        $this->assertDatabaseHas('user_game_data', [
            'user_id' => $user->id,
            'game' => GameSlug::MarbleSort->value,
            'scope' => GameDataScope::Save->value,
            'slot' => 'autosave',
            'revision' => 5,
            'is_deleted' => true,
        ]);
    }

    public function test_users_only_read_and_delete_their_own_rows(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $attributes = [
            'game' => GameSlug::Hover,
            'scope' => GameDataScope::Profile,
            'slot' => 'default',
        ];

        UserGameData::factory()->for($user)->create([
            ...$attributes,
            'data' => ['best_score' => 10],
        ]);
        $otherRow = UserGameData::factory()->for($otherUser)->create([
            ...$attributes,
            'data' => ['best_score' => 999],
        ]);

        $this->actingAs($user)->getJson('/api/games/data')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.data.best_score', 10);

        $this->actingAs($user)
            ->deleteJson('/api/games/hover/data/profile/default')
            ->assertNoContent();

        $this->assertDatabaseHas('user_game_data', ['id' => $otherRow->id]);
    }

    public function test_stale_save_revision_cannot_replace_or_delete_a_newer_slot(): void
    {
        $user = User::factory()->create();
        $row = UserGameData::factory()->for($user)->create([
            'game' => GameSlug::ParkingPickup,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
            'data' => ['version' => 3, 'state' => ['moves' => 8]],
            'revision' => 3,
        ]);
        $url = '/api/games/parking-pickup/data/save/autosave';

        $this->actingAs($user)->putJson($url, [
            'data' => ['version' => 3, 'state' => ['moves' => 2]],
            'revision' => 2,
        ])->assertOk()
            ->assertJsonPath('data.revision', 3)
            ->assertJsonPath('data.data.state.moves', 8);

        $this->actingAs($user)->deleteJson($url, ['revision' => 2])->assertNoContent();
        $this->assertDatabaseHas('user_game_data', ['id' => $row->id, 'revision' => 3]);

        $this->actingAs($user)->deleteJson($url, ['revision' => 3])->assertNoContent();
        $this->assertDatabaseHas('user_game_data', [
            'id' => $row->id,
            'revision' => 4,
            'is_deleted' => true,
        ]);
    }

    public function test_tower_and_invalid_route_values_are_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/games/tower-throwback/data/profile/default', [
            'data' => ['score' => 10],
        ])->assertUnprocessable()->assertJsonValidationErrors('game');

        $this->actingAs($user)->putJson('/api/games/hover/data/checkpoint/default', [
            'data' => ['score' => 10],
        ])->assertUnprocessable()->assertJsonValidationErrors('scope');

        $this->actingAs($user)->putJson('/api/games/hover/data/profile/bad!', [
            'data' => ['score' => 10],
        ])->assertUnprocessable()->assertJsonValidationErrors('slot');

        $this->actingAs($user)->putJson('/api/games/chicks-challenge/data/level/41', [
            'data' => ['version' => 1, 'stars' => 1],
        ])->assertUnprocessable()->assertJsonValidationErrors('slot');

        $this->actingAs($user)->putJson('/api/games/block-blaster/data/save/autosave', [
            'data' => ['version' => 1],
        ])->assertUnprocessable()->assertJsonValidationErrors('slot');

        $this->actingAs($user)->putJson('/api/games/math-horde/data/level/13', [
            'data' => ['version' => 1, 'stars' => 1],
        ])->assertUnprocessable()->assertJsonValidationErrors('slot');

        // 2048 is score-only: it has board sizes, not levels.
        $this->actingAs($user)->putJson('/api/games/2048/data/level/1', [
            'data' => ['version' => 1, 'score' => 10],
        ])->assertUnprocessable()->assertJsonValidationErrors('slot');
    }

    public function test_2048_accepts_its_profile_and_autosave_rows(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/games/2048/data/profile/default', [
                'data' => [
                    'version' => 1,
                    'games_played' => 3,
                    'high_score' => 12480,
                    'highest_tile' => 2048,
                    'boards' => ['size_4' => ['best_score' => 12480, 'highest_tile' => 2048]],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.game', GameSlug::TwentyFortyEight->value);

        // Best-score and games-played metrics must never move backwards.
        $this->actingAs($user)
            ->putJson('/api/games/2048/data/profile/default', [
                'data' => [
                    'version' => 1,
                    'games_played' => 1,
                    'high_score' => 100,
                    'highest_tile' => 32,
                    'boards' => ['size_4' => ['best_score' => 100, 'highest_tile' => 32]],
                ],
                'revision' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('data.data.games_played', 3)
            ->assertJsonPath('data.data.high_score', 12480)
            ->assertJsonPath('data.data.highest_tile', 2048)
            ->assertJsonPath('data.data.boards.size_4.best_score', 12480);

        $this->actingAs($user)
            ->putJson('/api/games/2048/data/save/autosave', [
                'data' => [
                    'version' => 1,
                    'score' => 480,
                    'status' => 'playing',
                    'board' => ['size' => 4, 'next_tile_id' => 2, 'tiles' => [['id' => 1, 'value' => 2, 'row' => 0, 'column' => 0]]],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.slot', 'autosave');
    }

    public function test_index_accepts_a_request_for_every_supported_game(): void
    {
        $slugs = array_map(static fn (GameSlug $game): string => $game->value, GameSlug::cases());

        // Game Select asks for every database-backed game at once, so the
        // `games` array limit must never fall behind the supported-game count.
        $this->actingAs(User::factory()->create())
            ->getJson('/api/games/data?'.http_build_query(['games' => $slugs]))
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_math_horde_accepts_its_final_campaign_level(): void
    {
        $this->actingAs(User::factory()->create())
            ->putJson('/api/games/math-horde/data/level/12', [
                'data' => ['version' => 1, 'stars' => 3, 'score' => 900, 'survivors' => 25],
            ])
            ->assertOk()
            ->assertJsonPath('data.game', GameSlug::MathHorde->value)
            ->assertJsonPath('data.slot', '12');
    }

    public function test_payload_must_be_an_array_within_the_size_limit(): void
    {
        $user = User::factory()->create();
        $url = '/api/games/parking-pickup/data/save/autosave';

        $this->actingAs($user)->putJson($url, [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)->putJson($url, ['data' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)->putJson($url, ['data' => 'not-an-object'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)->putJson($url, ['data' => [['snapshot' => true]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)->putJson($url, ['data' => ['score' => 'invalid']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data');

        $this->actingAs($user)->putJson($url, [
            'data' => ['snapshot' => str_repeat('x', ValidGameDataPayload::MAX_ENCODED_BYTES)],
        ])->assertUnprocessable()->assertJsonValidationErrors('data');
    }

    public function test_delete_is_idempotent_and_user_deletion_cascades(): void
    {
        $user = User::factory()->create();
        $row = UserGameData::factory()->for($user)->create([
            'game' => GameSlug::MarbleSort,
            'scope' => GameDataScope::Save,
            'slot' => 'autosave',
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/games/marble-sort/data/save/autosave', ['revision' => 0])
            ->assertNoContent();
        $this->assertDatabaseHas('user_game_data', ['id' => $row->id, 'is_deleted' => true]);

        $this->actingAs($user)
            ->deleteJson('/api/games/marble-sort/data/save/autosave', ['revision' => 0])
            ->assertNoContent();

        $this->actingAs($user)
            ->putJson('/api/games/marble-sort/data/save/autosave', [
                'data' => ['version' => 2, 'state' => ['moves' => 4]],
                'revision' => null,
            ])
            ->assertOk()
            ->assertJsonPath('status', 'saved')
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.is_deleted', false);

        $cascadeRow = UserGameData::factory()->for($user)->create();
        $user->delete();

        $this->assertDatabaseMissing('user_game_data', ['id' => $cascadeRow->id]);
    }

    public function test_index_returns_all_supported_games_in_stable_order(): void
    {
        $user = User::factory()->create();
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::Hover,
            'scope' => GameDataScope::Profile,
        ]);
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::ChicksChallenge,
            'scope' => GameDataScope::Level,
            'slot' => '2',
        ]);
        UserGameData::factory()->for($user)->create([
            'game' => GameSlug::TwentyFortyEight,
            'scope' => GameDataScope::Profile,
        ]);

        $this->actingAs($user)->getJson('/api/games/data')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.game', '2048')
            ->assertJsonPath('data.1.game', 'chicks-challenge')
            ->assertJsonPath('data.2.game', 'hover');
    }
}
