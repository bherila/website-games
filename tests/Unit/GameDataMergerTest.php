<?php

namespace Tests\Unit;

use App\Services\Games\GameDataMerger;
use PHPUnit\Framework\TestCase;

class GameDataMergerTest extends TestCase
{
    public function test_merge_preserves_monotonic_metrics_and_updates_other_values(): void
    {
        $result = (new GameDataMerger)->merge(
            [
                'score' => 100,
                'bestScore' => 80,
                'mapsCleared' => 4,
                'survivors' => 20,
                'best_moves' => 12,
                'nested' => ['high_score' => 70, 'mode' => 'old'],
            ],
            [
                'score' => 90,
                'bestScore' => 85,
                'mapsCleared' => 3,
                'survivors' => 15,
                'best_moves' => 15,
                'nested' => ['high_score' => 60, 'mode' => 'new'],
            ],
        );

        $this->assertSame([
            'score' => 100,
            'bestScore' => 85,
            'mapsCleared' => 4,
            'survivors' => 20,
            'best_moves' => 12,
            'nested' => ['high_score' => 70, 'mode' => 'new'],
        ], $result);
    }

    public function test_best_moves_uses_the_smallest_positive_value(): void
    {
        $merger = new GameDataMerger;

        $this->assertSame(
            ['best_moves' => 14],
            $merger->merge(['best_moves' => 0], ['best_moves' => 14]),
        );
        $this->assertSame(
            ['best_moves' => 14],
            $merger->merge(['best_moves' => 14], ['best_moves' => 0]),
        );
    }

    public function test_list_values_are_replaced_instead_of_recursively_merged(): void
    {
        $result = (new GameDataMerger)->merge(
            ['score' => 10, 'board' => [1, 2, 3], 'metadata' => ['old' => true]],
            ['board' => [4], 'metadata' => []],
        );

        $this->assertSame(
            ['score' => 10, 'board' => [4], 'metadata' => []],
            $result,
        );
    }

    public function test_empty_profile_update_does_not_erase_existing_data(): void
    {
        $result = (new GameDataMerger)->merge(
            ['score' => 10, 'stars' => 3],
            [],
        );

        $this->assertSame(['score' => 10, 'stars' => 3], $result);
    }

    public function test_size_keyed_board_bests_and_games_played_stay_monotonic(): void
    {
        $result = (new GameDataMerger)->merge(
            [
                'version' => 1,
                'games_played' => 47,
                'high_score' => 12480,
                'highest_tile' => 2048,
                'boards' => [
                    'size_4' => ['best_score' => 12480, 'highest_tile' => 2048],
                    'size_6' => ['best_score' => 300, 'highest_tile' => 64],
                ],
            ],
            [
                'version' => 1,
                'games_played' => 12,
                'high_score' => 900,
                'highest_tile' => 256,
                'boards' => [
                    'size_4' => ['best_score' => 900, 'highest_tile' => 256],
                    'size_6' => ['best_score' => 4000, 'highest_tile' => 512],
                ],
            ],
        );

        $this->assertSame([
            'version' => 1,
            'games_played' => 47,
            'high_score' => 12480,
            'highest_tile' => 2048,
            'boards' => [
                'size_4' => ['best_score' => 12480, 'highest_tile' => 2048],
                'size_6' => ['best_score' => 4000, 'highest_tile' => 512],
            ],
        ], $result);
    }

    public function test_invalid_incoming_maximum_does_not_replace_a_numeric_best(): void
    {
        $result = (new GameDataMerger)->merge(
            ['score' => 10],
            ['score' => 'invalid'],
        );

        $this->assertSame(['score' => 10], $result);
    }
}
