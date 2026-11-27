<?php

namespace Tests\Feature\Games;

use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TowerRevisionTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/games/tower-throwback/saves/slot-a';

    private function write(string $revision, string $token = 'device-a'): array
    {
        return ['sync_protocol' => 2, 'expected_revision' => $revision, 'lease_token' => $token,
            'payload' => ['version' => 2, 'funds' => 10], 'wire_version' => 2];
    }

    public function test_legacy_mutations_require_reload_and_do_not_change_the_slot(): void
    {
        $user = User::factory()->create();
        $slot = TowerSaveSlot::factory()->for($user)->create()->fresh();
        $before = $slot->getAttributes();
        $legacy = $this->write($slot->content_revision);
        unset($legacy['sync_protocol']);
        $this->actingAs($user)->putJson(self::URL, $legacy)->assertStatus(428);
        $this->deleteJson(self::URL)->assertStatus(428);
        $this->postJson(self::URL.'/lease', ['force' => true])->assertStatus(428);
        $this->deleteJson(self::URL.'/lease', ['lease_token' => 'x'])->assertStatus(428);
        $this->assertEquals($before, $slot->fresh()->getAttributes());
        $this->getJson(self::URL)->assertOk();
    }

    public function test_same_revision_has_one_winner_and_delete_recreate_never_reuses_it(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson(self::URL, $this->write('absent'))->assertOk();
        $first = TowerSaveSlot::query()->sole()->content_revision;
        $this->putJson(self::URL, $this->write('absent'))->assertStatus(412);
        $this->putJson(self::URL, $this->write($first))->assertOk();
        $second = TowerSaveSlot::query()->sole()->content_revision;
        $this->assertNotSame($first, $second);
        $this->deleteJson(self::URL, ['sync_protocol' => 2, 'expected_revision' => $second])->assertNoContent();
        $deleted = TowerSaveSlot::query()->sole()->content_revision;
        $this->assertNotSame($second, $deleted);
        $this->putJson(self::URL, $this->write($second))->assertStatus(412);
        $this->putJson(self::URL, $this->write($deleted))->assertOk();
        $this->deleteJson(self::URL, ['sync_protocol' => 2, 'expected_revision' => $second])->assertStatus(412);
        $this->assertNotNull(TowerSaveSlot::query()->sole()->payload);
    }

    public function test_restore_fences_delayed_put_without_taking_another_devices_lease(): void
    {
        $user = User::factory()->create();
        $slot = TowerSaveSlot::factory()->for($user)->leasedTo('device-a')->create();
        $this->actingAs($user)->postJson(self::URL.'/restore', ['sync_protocol' => 2, 'expected_revision' => $slot->content_revision])
            ->assertOk()->assertJsonPath('data.payload', $slot->payload)->assertJsonMissingPath('data.lease_token');
        $fenced = $slot->fresh();
        $this->assertNotSame($slot->content_revision, $fenced->content_revision);
        $this->assertSame('device-a', $fenced->lease_token);
        $this->putJson(self::URL, $this->write($slot->content_revision))->assertStatus(412);
        $this->assertSame($slot->payload, $fenced->fresh()->payload);
    }

    public function test_lease_activity_keeps_revision_but_stale_authority_is_rejected(): void
    {
        $user = User::factory()->create();
        $slot = TowerSaveSlot::factory()->for($user)->leasedTo('device-a')->create();
        $token = $this->actingAs($user)->postJson(self::URL.'/lease', ['sync_protocol' => 2, 'force' => true])->assertOk()->json('data.lease_token');
        $this->assertSame($slot->content_revision, $slot->fresh()->content_revision);
        $this->putJson(self::URL, $this->write($slot->content_revision))->assertStatus(409);
        $this->putJson(self::URL, $this->write($slot->content_revision, $token))->assertOk();
    }

    public function test_owner_delete_does_not_need_the_other_devices_lease_but_does_need_revision(): void
    {
        $user = User::factory()->create();
        $slot = TowerSaveSlot::factory()->for($user)->leasedTo('another-device')->create();
        $this->actingAs($user)->deleteJson(self::URL, ['sync_protocol' => 2, 'expected_revision' => $slot->content_revision])->assertNoContent();
        $this->assertNull($slot->fresh()->payload);
        $this->assertNull($slot->fresh()->lease_token);
    }
}
