<?php

namespace Tests\Feature\Games;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChicksProgressRevisionTest extends TestCase
{
    use RefreshDatabase;

    public function test_layout_upgrade_drops_only_the_obsolete_best_and_accepts_a_new_best(): void
    {
        $this->actingAs(User::factory()->create());
        $url = '/api/games/chicks-challenge/data/level/7';

        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 3, 'best_moves' => 19],
        ])->assertOk();

        // Promotion of the old stars has no best for the redrawn layout.
        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 2, 'layout_revision' => 2],
        ])->assertOk()
            ->assertJsonPath('data.data.stars', 3)
            ->assertJsonPath('data.data.layout_revision', 2)
            ->assertJsonMissingPath('data.data.best_moves');

        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 2, 'best_moves' => 46, 'layout_revision' => 2],
        ])->assertOk()
            ->assertJsonPath('data.data.stars', 3)
            ->assertJsonPath('data.data.best_moves', 46);

        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 1, 'best_moves' => 50, 'layout_revision' => 2],
        ])->assertOk()->assertJsonPath('data.data.best_moves', 46);

        $this->getJson('/api/games/data?games[]=chicks-challenge')->assertOk()
            ->assertJsonPath('data.0.data', ['version' => 1, 'stars' => 3, 'layout_revision' => 2, 'best_moves' => 46]);
    }

    public function test_old_client_cannot_restore_an_obsolete_best_but_can_keep_earned_stars(): void
    {
        $this->actingAs(User::factory()->create());
        $url = '/api/games/chicks-challenge/data/level/7';
        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 2, 'best_moves' => 46, 'layout_revision' => 2],
        ])->assertOk();

        foreach ([[], ['layout_revision' => 1]] as $metadata) {
            $this->putJson($url, [
                'data' => ['version' => 1, 'stars' => 3, 'best_moves' => 19, ...$metadata],
            ])->assertOk()
                ->assertJsonPath('data.data.stars', 3)
                ->assertJsonPath('data.data.best_moves', 46)
                ->assertJsonPath('data.data.layout_revision', 2);
        }
    }

    public function test_unchanged_layout_keeps_its_legacy_best_when_metadata_is_added(): void
    {
        $this->actingAs(User::factory()->create());
        $url = '/api/games/chicks-challenge/data/level/6';
        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 2, 'best_moves' => 30],
        ])->assertOk();

        $this->putJson($url, [
            'data' => ['version' => 1, 'stars' => 3, 'best_moves' => 40, 'layout_revision' => 1],
        ])->assertOk()
            ->assertJsonPath('data.data.stars', 3)
            ->assertJsonPath('data.data.best_moves', 30)
            ->assertJsonPath('data.data.layout_revision', 1);
    }

    public function test_batch_upgrade_does_not_merge_bests_across_layouts(): void
    {
        $this->actingAs(User::factory()->create());
        $this->putJson('/api/games/chicks-challenge/data/level/7', [
            'data' => ['version' => 1, 'stars' => 3, 'best_moves' => 19],
        ])->assertOk();

        $this->putJson('/api/games/chicks-challenge/data', [
            'operations' => [[
                'action' => 'put', 'scope' => 'level', 'slot' => '7',
                'data' => ['version' => 1, 'stars' => 2, 'best_moves' => 46, 'layout_revision' => 2],
            ]],
        ])->assertOk()
            ->assertJsonPath('data.0.row.data.best_moves', 46)
            ->assertJsonPath('data.0.row.data.stars', 3);
    }

    public function test_layout_revision_must_be_a_positive_integer(): void
    {
        $this->actingAs(User::factory()->create());

        foreach ([0, -1, 1.5, '2', null] as $revision) {
            $this->putJson('/api/games/chicks-challenge/data/level/7', [
                'data' => ['version' => 1, 'stars' => 3, 'layout_revision' => $revision],
            ])->assertUnprocessable()->assertJsonValidationErrors('data');
        }
    }
}
