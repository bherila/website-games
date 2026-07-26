<?php

namespace Tests\Feature\Games;

use App\Http\Requests\Games\StoreTowerSaveRequest;
use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TowerSaveSlotTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function payload(int $version = 2): array
    {
        return [
            'payload' => ['version' => $version, 'mapId' => 'city-tower', 'funds' => 12345],
            'wire_version' => $version,
            'game_day' => 7,
            'star' => 3,
            'population' => 250,
            'funds' => 12345,
        ];
    }

    private function acquireToken(User $user, string $slot = 'slot-a'): string
    {
        $response = $this->actingAs($user)
            ->postJson("/api/games/tower-throwback/saves/{$slot}/lease")
            ->assertOk();

        return $response->json('data.lease_token');
    }

    public function test_guest_cannot_access_tower_save_endpoints(): void
    {
        $this->getJson('/api/games/tower-throwback/saves')->assertUnauthorized();
        $this->getJson('/api/games/tower-throwback/saves/slot-a')->assertUnauthorized();
        $this->putJson('/api/games/tower-throwback/saves/slot-a', $this->payload())->assertUnauthorized();
        $this->postJson('/api/games/tower-throwback/saves/slot-a/lease')->assertUnauthorized();
        $this->deleteJson('/api/games/tower-throwback/saves/slot-a')->assertUnauthorized();
    }

    public function test_index_is_empty_for_user_without_saves(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/games/tower-throwback/saves')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_index_returns_metadata_without_payload_or_token(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        $this->actingAs($user)
            ->getJson('/api/games/tower-throwback/saves')
            ->assertOk()
            ->assertJsonPath('data.0.slot', 'slot-a')
            ->assertJsonPath('data.0.saved', true)
            ->assertJsonPath('data.0.game_day', 7)
            ->assertJsonMissingPath('data.0.payload')
            ->assertJsonMissingPath('data.0.lease_token');
    }

    public function test_user_cannot_read_another_users_slot(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $token = $this->acquireToken($owner);
        $this->actingAs($owner)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        $this->actingAs($intruder)
            ->getJson('/api/games/tower-throwback/saves/slot-a')
            ->assertNotFound();
        $this->actingAs($intruder)
            ->getJson('/api/games/tower-throwback/saves')
            ->assertExactJson(['data' => []]);
    }

    public function test_user_cannot_overwrite_another_users_slot(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $token = $this->acquireToken($owner);
        $this->actingAs($owner)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        // A different user holds no lease on their own (separate) slot row, so
        // their write creates an independent row rather than touching the owner's.
        $intruderToken = $this->acquireToken($intruder);
        $this->actingAs($intruder)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                ...$this->payload(),
                'payload' => ['version' => 2, 'mapId' => 'city-tower', 'funds' => 999],
                'funds' => 999,
                'lease_token' => $intruderToken,
            ])
            ->assertOk();

        $this->assertSame(12345, TowerSaveSlot::where('user_id', $owner->id)->first()->funds);
        $this->assertSame(999, TowerSaveSlot::where('user_id', $intruder->id)->first()->funds);
    }

    public function test_show_returns_payload_for_saved_slot(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        $this->actingAs($user)
            ->getJson('/api/games/tower-throwback/saves/slot-a')
            ->assertOk()
            ->assertJsonPath('data.payload.mapId', 'city-tower')
            ->assertJsonPath('data.saved', true);
    }

    public function test_show_returns_404_for_empty_slot(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/games/tower-throwback/saves/slot-b')
            ->assertNotFound();
    }

    public function test_put_round_trips_and_stores_metadata(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);

        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk()
            ->assertJsonPath('data.lease_token', $token)
            ->assertJsonPath('data.lease_active', true);

        $this->assertDatabaseHas('tower_save_slots', [
            'user_id' => $user->id,
            'slot' => 'slot-a',
            'wire_version' => 2,
            'game_day' => 7,
        ]);
    }

    public function test_put_rejects_unknown_slot_key(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-z', [...$this->payload(), 'lease_token' => 'x'])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('slot');
    }

    public function test_put_rejects_future_wire_version(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                ...$this->payload(99),
                'lease_token' => $token,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('wire_version');
    }

    public function test_put_rejects_oversized_payload(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                'payload' => ['version' => 2, 'blob' => str_repeat('a', 1_048_600)],
                'wire_version' => 2,
                'lease_token' => $token,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('payload');
    }

    /**
     * The client predicts this boundary in `saveBudget.ts` and refuses to push
     * an over-budget save, so the two sides must agree on it exactly.
     */
    public function test_put_accepts_a_payload_exactly_at_the_byte_cap(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);

        $envelope = json_encode(['version' => 2, 'blob' => '']);
        $this->assertNotFalse($envelope);
        $blobLength = StoreTowerSaveRequest::MAX_PAYLOAD_BYTES - strlen($envelope);

        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                'payload' => ['version' => 2, 'blob' => str_repeat('a', $blobLength)],
                'wire_version' => 2,
                'lease_token' => $token,
            ])
            ->assertOk();
    }

    /**
     * The cap is BYTES, not characters. A payload of multi-byte characters that
     * looks small by character count must still be rejected once encoded.
     */
    public function test_put_measures_the_cap_in_bytes_not_characters(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);

        // Each 'e' with an acute accent is 2 bytes, so half the cap in
        // characters is already the whole cap in bytes.
        $characters = intdiv(StoreTowerSaveRequest::MAX_PAYLOAD_BYTES, 2);

        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                'payload' => ['version' => 2, 'blob' => str_repeat('é', $characters)],
                'wire_version' => 2,
                'lease_token' => $token,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('payload');
    }

    public function test_put_matches_the_clients_utf8_json_boundary(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
        $empty = json_encode(['version' => 2, 'blob' => ''], $flags);
        $this->assertNotFalse($empty);

        $remainingBytes = StoreTowerSaveRequest::MAX_PAYLOAD_BYTES - strlen($empty);
        $blob = str_repeat('é', intdiv($remainingBytes, 2));
        if ($remainingBytes % 2 === 1) {
            $blob .= 'a';
        }

        $atCap = ['version' => 2, 'blob' => $blob];
        $encoded = json_encode($atCap, $flags);
        $this->assertNotFalse($encoded);
        $this->assertSame(StoreTowerSaveRequest::MAX_PAYLOAD_BYTES, strlen($encoded));

        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                'payload' => $atCap,
                'wire_version' => 2,
                'lease_token' => $token,
            ])
            ->assertOk();

        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                'payload' => [...$atCap, 'blob' => $blob.'a'],
                'wire_version' => 2,
                'lease_token' => $token,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('payload');
    }

    /**
     * The client refuses to push an over-budget save, which only works if it
     * knows the exact cap this request enforces. The two constants drifted
     * silently once already (client 5,000,000 chars vs server 1,048,576 bytes,
     * with a comment here claiming they matched), so pin them together.
     */
    public function test_client_and_server_cloud_budgets_agree(): void
    {
        $source = file_get_contents(resource_path('js/games/tower-throwback/saveBudget.ts'));
        $this->assertNotFalse($source, 'saveBudget.ts is missing');

        $matched = preg_match('/MAX_CLOUD_PAYLOAD_BYTES\s*=\s*([0-9_]+)/', $source, $matches);
        $this->assertSame(1, $matched, 'MAX_CLOUD_PAYLOAD_BYTES not found in saveBudget.ts');

        $this->assertSame(
            StoreTowerSaveRequest::MAX_PAYLOAD_BYTES,
            (int) str_replace('_', '', $matches[1]),
            'The client cloud budget must equal StoreTowerSaveRequest::MAX_PAYLOAD_BYTES.',
        );
    }

    public function test_acquire_issues_lease_and_renew_keeps_token(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->assertNotEmpty($token);

        // Renew with the same token → same token, extended expiry.
        $renewed = $this->actingAs($user)
            ->postJson('/api/games/tower-throwback/saves/slot-a/lease', ['lease_token' => $token])
            ->assertOk()
            ->json('data.lease_token');

        $this->assertSame($token, $renewed);
    }

    public function test_stale_token_write_conflicts_when_another_lease_is_active(): void
    {
        $user = User::factory()->create();
        // Device A holds the lease.
        $tokenA = $this->acquireToken($user);

        // Device B writes with a stale/foreign token.
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [
                ...$this->payload(),
                'lease_token' => 'stale-token-b',
            ])
            ->assertStatus(409)
            ->assertJsonStructure(['conflict' => ['acquired_at', 'expires_at']])
            ->assertJsonMissingPath('conflict.lease_token');

        // Device A can still write with its valid token.
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $tokenA])
            ->assertOk();
    }

    public function test_acquire_conflicts_when_lease_active_and_no_force(): void
    {
        $user = User::factory()->create();
        $this->acquireToken($user);

        $this->actingAs($user)
            ->postJson('/api/games/tower-throwback/saves/slot-a/lease')
            ->assertStatus(409)
            ->assertJsonStructure(['conflict' => ['acquired_at', 'expires_at']]);
    }

    public function test_force_takeover_issues_new_token_and_displaces_old_lease(): void
    {
        $user = User::factory()->create();
        $tokenA = $this->acquireToken($user);

        $tokenB = $this->actingAs($user)
            ->postJson('/api/games/tower-throwback/saves/slot-a/lease', ['force' => true])
            ->assertOk()
            ->json('data.lease_token');

        $this->assertNotSame($tokenA, $tokenB);

        // The displaced token now conflicts on write.
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $tokenA])
            ->assertStatus(409);

        // The new token succeeds.
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $tokenB])
            ->assertOk();
    }

    public function test_expired_lease_is_free_to_claim(): void
    {
        $user = User::factory()->create();
        TowerSaveSlot::factory()
            ->for($user)
            ->leaseExpired('old-token')
            ->create(['slot' => 'slot-a']);

        // No force required: the prior lease has expired.
        $this->actingAs($user)
            ->postJson('/api/games/tower-throwback/saves/slot-a/lease')
            ->assertOk();

        // A fresh token may also write straight through a separate expired lease.
        TowerSaveSlot::factory()
            ->for($user)
            ->leaseExpired('old-token')
            ->create(['slot' => 'slot-b']);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-b', [...$this->payload(), 'lease_token' => 'brand-new'])
            ->assertOk();
    }

    public function test_release_clears_lease_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);

        $this->actingAs($user)
            ->deleteJson('/api/games/tower-throwback/saves/slot-a/lease', ['lease_token' => $token])
            ->assertNoContent();

        $this->assertNull(TowerSaveSlot::where('user_id', $user->id)->first()->lease_token);

        // A second release with a stale token is a no-op, not an error.
        $this->actingAs($user)
            ->deleteJson('/api/games/tower-throwback/saves/slot-a/lease', ['lease_token' => 'anything'])
            ->assertNoContent();

        // After release, another token can claim the slot without force.
        $this->actingAs($user)
            ->postJson('/api/games/tower-throwback/saves/slot-a/lease')
            ->assertOk();
    }

    public function test_release_does_not_clear_a_lease_held_by_a_different_token(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);

        $this->actingAs($user)
            ->deleteJson('/api/games/tower-throwback/saves/slot-a/lease', ['lease_token' => 'not-the-holder'])
            ->assertNoContent();

        $this->assertSame($token, TowerSaveSlot::where('user_id', $user->id)->first()->lease_token);
    }

    public function test_destroy_removes_the_slot(): void
    {
        $user = User::factory()->create();
        $token = $this->acquireToken($user);
        $this->actingAs($user)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        $this->actingAs($user)
            ->deleteJson('/api/games/tower-throwback/saves/slot-a')
            ->assertNoContent();

        $this->assertDatabaseMissing('tower_save_slots', [
            'user_id' => $user->id,
            'slot' => 'slot-a',
        ]);
    }

    public function test_user_cannot_destroy_another_users_slot(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $token = $this->acquireToken($owner);
        $this->actingAs($owner)
            ->putJson('/api/games/tower-throwback/saves/slot-a', [...$this->payload(), 'lease_token' => $token])
            ->assertOk();

        $this->actingAs($intruder)
            ->deleteJson('/api/games/tower-throwback/saves/slot-a')
            ->assertNoContent();

        $this->assertDatabaseHas('tower_save_slots', [
            'user_id' => $owner->id,
            'slot' => 'slot-a',
        ]);
    }
}
