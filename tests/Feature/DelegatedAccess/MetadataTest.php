<?php

namespace Tests\Feature\DelegatedAccess;

use Illuminate\Support\Facades\DB;

/**
 * Read-only observations on a state and on each listing entry: when the account was created.
 * Sign-ins are not tracked here, so nothing claims to know them.
 */
class MetadataTest extends DelegatedAccessTestCase
{
    public function test_a_state_and_its_listing_entry_carry_when_the_account_was_created(): void
    {
        $player = $this->account('player-subject');
        DB::table('users')->where('id', $player->getKey())->update(['created_at' => '2026-03-04 05:06:07']);

        $state = $this->delegatedAccessRead(self::MANAGER, 'player-subject');
        $this->assertSame('2026-03-04T05:06:07Z', $state['provisioned_at']);
        $this->assertArrayNotHasKey('first_sign_in_at', $state);
        $this->assertArrayNotHasKey('last_seen_at', $state);

        $entries = array_column($this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'limit' => 50])['subjects'], null, 'subject');
        $this->assertSame('2026-03-04T05:06:07Z', $entries['player-subject']['provisioned_at']);

        $this->assertDelegatedMetadataIsWellFormed(self::MANAGER, 'player-subject');
    }

    public function test_an_unknown_creation_time_is_null_and_an_unprovisioned_subject_carries_none(): void
    {
        $player = $this->account('player-subject');
        DB::table('users')->where('id', $player->getKey())->update(['created_at' => null]);

        $this->assertNull($this->delegatedAccessRead(self::MANAGER, 'player-subject')['provisioned_at']);
        $this->assertArrayNotHasKey('provisioned_at', $this->delegatedAccessCall(self::MANAGER, ['operation' => 'read', 'subject' => 'newcomer']));
    }

    public function test_metadata_is_not_part_of_the_revision(): void
    {
        $player = $this->account('player-subject');
        $before = $this->delegatedAccessRead(self::MANAGER, 'player-subject');
        DB::table('users')->where('id', $player->getKey())->update(['created_at' => '2020-01-01 00:00:00']);

        $after = $this->delegatedAccessRead(self::MANAGER, 'player-subject');
        $this->assertNotSame($before['provisioned_at'], $after['provisioned_at']);
        $this->assertSame($before['revision'], $after['revision']);
    }
}
