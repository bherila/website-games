<?php

namespace Tests\Feature\Account;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Models\EmailChangeRequest;
use App\Models\TowerSaveSlot;
use App\Models\User;
use App\Models\UserGameData;
use App\Models\UserIdentity;
use App\Notifications\ConfirmEmailAddress;
use App\Services\Account\AccountMerge;
use App\Services\Account\AccountMergeRefused;
use App\Services\Admin\AccessAudit;
use App\Services\Games\GameDataStore;
use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AccountMergeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Notification::fake();
    }

    public function test_progress_combines_like_two_devices_and_the_absorbed_account_is_deleted(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        // Only the absorbed account has level 3: it moves as is.
        $this->row($absorb, GameDataScope::Level, '3', ['version' => 1, 'stars' => 2]);
        // Both have level 1: best stars and fewest moves win; the newer row's other fields win.
        $kept = $this->row($keep, GameDataScope::Level, '1', ['version' => 1, 'stars' => 3, 'best_moves' => 40, 'note' => 'kept'], minutesAgo: 30);
        $this->row($absorb, GameDataScope::Level, '1', ['version' => 1, 'stars' => 1, 'best_moves' => 25, 'note' => 'absorbed'], minutesAgo: 5);
        // Both have a mid-level snapshot: the newer one is kept whole.
        $this->row($keep, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'kept'], minutesAgo: 1);
        $this->row($absorb, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'absorbed'], minutesAgo: 60);

        $summary = app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $this->assertSame(3, $summary['game_rows']);
        $this->assertModelMissing($absorb);
        $this->assertSame(['version' => 1, 'stars' => 3, 'best_moves' => 25, 'note' => 'absorbed'], $this->data($keep, GameDataScope::Level, '1'));
        $this->assertSame(['version' => 1, 'stars' => 2], $this->data($keep, GameDataScope::Level, '3'));
        $this->assertSame(['version' => 1, 'board' => 'kept'], $this->data($keep, GameDataScope::Save, 'autosave'));
        // A new revision makes the kept account's devices read the combined row.
        $this->assertSame($kept->revision + 1, $kept->fresh()?->revision);
        $this->assertSame(['absorbed_user_id' => $absorb->getKey(), 'game_rows' => 3, 'tower_slots' => 0, 'practice_events' => 0], AuthAuditLog::query()->where('event', AccessAudit::ACCOUNTS_MERGED)->sole()->metadata);
        $this->assertSame(1, AuthAuditLog::query()->where('event', AccessAudit::ACCOUNT_DELETED)->count());
    }

    public function test_a_deletion_tombstone_never_erases_the_other_accounts_progress(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        $this->row($keep, GameDataScope::Save, 'autosave', ['version' => 1], deleted: true);
        $this->row($absorb, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'live']);
        $this->row($keep, GameDataScope::Level, '2', ['version' => 1, 'stars' => 3]);
        $this->row($absorb, GameDataScope::Level, '2', ['version' => 1], deleted: true);

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $this->assertSame(['version' => 1, 'board' => 'live'], $this->data($keep, GameDataScope::Save, 'autosave'));
        $this->assertFalse(UserGameData::query()->where('user_id', $keep->getKey())->where('slot', 'autosave')->sole()->is_deleted);
        $this->assertSame(['version' => 1, 'stars' => 3], $this->data($keep, GameDataScope::Level, '2'));
    }

    public function test_tower_saves_move_into_free_slots_and_otherwise_keep_the_newer(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        TowerSaveSlot::factory()->for($keep)->create(['slot' => 'slot-a', 'game_day' => 1]);
        TowerSaveSlot::factory()->for($keep)->create(['slot' => 'autosave', 'game_day' => 2, 'updated_at' => now()->subHour()]);
        TowerSaveSlot::factory()->for($absorb)->create(['slot' => 'slot-a', 'game_day' => 11]);
        TowerSaveSlot::factory()->for($absorb)->create(['slot' => 'autosave', 'game_day' => 12, 'updated_at' => now()]);
        TowerSaveSlot::factory()->for($absorb)->create(['slot' => 'slot-c', 'game_day' => 13, 'lease_token' => 'held']);

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $slots = TowerSaveSlot::query()->where('user_id', $keep->getKey())->pluck('game_day', 'slot')->sortKeys()->all();
        // slot-a clashed and moved to the first free manual slot; the newer autosave won.
        $this->assertSame(['autosave' => 12, 'slot-a' => 1, 'slot-b' => 11, 'slot-c' => 13], $slots);
        $this->assertNull(TowerSaveSlot::query()->where('user_id', $keep->getKey())->where('slot', 'slot-c')->sole()->lease_token);
    }

    public function test_practice_events_move_after_the_kept_accounts_last_one_without_duplicates(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        $this->event($keep, 'shared', 1);
        $this->event($keep, 'kept-only', 2);
        $this->event($absorb, 'shared', 1);
        $this->event($absorb, 'absorbed-a', 2);
        $this->event($absorb, 'absorbed-b', 3);

        $summary = app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $this->assertSame(2, $summary['practice_events']);
        $this->assertSame(
            ['shared' => 1, 'kept-only' => 2, 'absorbed-a' => 3, 'absorbed-b' => 4],
            DB::table('mandarin_practice_events')->where('user_id', $keep->getKey())->orderBy('sequence')->pluck('sequence', 'client_event_id')->all(),
        );
    }

    public function test_an_open_game_cannot_overwrite_an_imported_snapshot_by_its_writer_sequence(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        $kept = $this->row($keep, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'kept'], minutesAgo: 60);
        // Set directly so the row keeps its older timestamp.
        DB::table('user_game_data')->where('id', $kept->getKey())->update(['writer_id' => 'open-device', 'writer_sequence' => 5]);
        $this->row($absorb, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'imported']);

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        // The device that had the kept row open writes its pre-merge state with its next sequence.
        $result = app(GameDataStore::class)->upsert($keep, GameSlug::ChicksChallenge, GameDataScope::Save, 'autosave', ['version' => 1, 'board' => 'stale'], $kept->revision, 'open-device', 6);

        $this->assertSame('stale', $result['status']);
        $this->assertSame(['version' => 1, 'board' => 'imported'], $this->data($keep, GameDataScope::Save, 'autosave'));
    }

    public function test_a_lease_only_tower_row_never_replaces_a_real_save(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        // Kept: a real autosave, older. Absorbed: a newer lease with no payload.
        TowerSaveSlot::factory()->for($keep)->create(['slot' => 'autosave', 'game_day' => 7, 'updated_at' => now()->subDay()]);
        TowerSaveSlot::factory()->for($absorb)->create(['slot' => 'autosave', 'payload' => null, 'updated_at' => now()]);
        // Kept: a newer lease in slot-a. Absorbed: a real older save there.
        TowerSaveSlot::factory()->for($keep)->create(['slot' => 'slot-a', 'payload' => null, 'updated_at' => now()]);
        TowerSaveSlot::factory()->for($absorb)->create(['slot' => 'slot-a', 'game_day' => 9, 'updated_at' => now()->subDay()]);

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $slots = TowerSaveSlot::query()->where('user_id', $keep->getKey())->get()->keyBy('slot');
        $this->assertSame(7, $slots->get('autosave')?->game_day);
        $this->assertTrue($slots->get('slot-a')?->hasPayload());
        $this->assertSame(9, $slots->get('slot-a')?->game_day);
        $this->assertCount(2, $slots);
    }

    public function test_no_practice_event_delete_selects_from_its_own_table(): void
    {
        // MySQL rejects DELETE ... WHERE x IN (SELECT ... FROM the same table); SQLite allows it,
        // so the statement shape is checked here rather than by running on MySQL.
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        $this->event($keep, 'shared', 1);
        $this->event($absorb, 'shared', 1);
        $deletes = [];
        DB::listen(function ($query) use (&$deletes): void {
            if (str_starts_with(strtolower(ltrim($query->sql)), 'delete') && str_contains($query->sql, 'mandarin_practice_events')) {
                $deletes[] = $query->sql;
            }
        });

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $this->assertNotEmpty($deletes);
        foreach ($deletes as $sql) {
            $this->assertStringNotContainsString('select', strtolower($sql), $sql);
        }
    }

    public function test_merged_practice_history_replays_in_the_order_it_happened(): void
    {
        [$keep, $absorb] = [User::factory()->create(), User::factory()->create()];
        $this->event($keep, 'kept-day-2', 1, now()->subDays(8));
        $this->event($keep, 'kept-day-4', 2, now()->subDays(6));
        $this->event($absorb, 'absorbed-day-1', 1, now()->subDays(9));
        $this->event($absorb, 'absorbed-day-3', 2, now()->subDays(7));

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $this->assertSame(
            ['absorbed-day-1' => 1, 'kept-day-2' => 2, 'absorbed-day-3' => 3, 'kept-day-4' => 4],
            DB::table('mandarin_practice_events')->where('user_id', $keep->getKey())->orderBy('sequence')->pluck('sequence', 'client_event_id')->all(),
        );
    }

    public function test_sign_in_methods_move_to_the_kept_account(): void
    {
        $keep = User::factory()->create();
        $absorb = User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'absorbed-subject']);
        $absorb->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'absorbed-google', 'email' => 'a@example.test']);

        app(AccountMerge::class)->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);

        $keep->refresh();
        $this->assertSame(['bherila', 'absorbed-subject'], [$keep->oauth_provider, $keep->oauth_subject]);
        $this->assertSame('absorbed-google', $keep->identities()->sole()->subject);
    }

    public function test_merges_that_would_drop_a_sign_in_or_an_administrator_are_refused(): void
    {
        $merge = app(AccountMerge::class);
        $user = User::factory()->create();
        $refused = function (User $keep, User $absorb) use ($merge): void {
            try {
                $merge->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);
                $this->fail('Expected the merge to be refused.');
            } catch (AccountMergeRefused) {
                $this->assertModelExists($absorb);
            }
        };

        $refused($user, $user);
        $refused($user, User::factory()->administrator()->create());
        $refused(
            User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'one']),
            User::factory()->create(['oauth_provider' => 'bherila', 'oauth_subject' => 'two']),
        );
        [$a, $b] = [User::factory()->create(), User::factory()->create()];
        $a->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'g-a']);
        $b->identities()->create(['provider' => UserIdentity::GOOGLE, 'subject' => 'g-b']);
        $refused($a, $b);
    }

    public function test_confirming_an_address_held_by_a_confirmed_account_offers_a_merge(): void
    {
        $keep = User::factory()->create(['email' => 'mine@example.test']);
        $other = User::factory()->create(['name' => 'Other Me', 'email' => 'shared@example.test', 'email_verified_at' => now()]);
        $this->row($other, GameDataScope::Level, '1', ['version' => 1, 'stars' => 3]);

        $this->actingAs($keep)->post('/account/email', ['email' => 'shared@example.test']);
        $this->actingAs($keep)->get('/account/email/confirm/'.$this->tokenSentTo('shared@example.test'))->assertRedirect('/account');
        $this->assertSame('mine@example.test', $keep->fresh()?->email);
        $this->actingAs($keep)->get('/account')->assertOk()->assertSee('Merge your other account?')->assertSee('Other Me');

        $this->actingAs($keep)->post('/account/merge')->assertRedirect('/account')->assertSessionHas('status');

        $this->assertModelMissing($other);
        $this->assertSame('shared@example.test', $keep->fresh()?->email);
        $this->assertNotNull($keep->fresh()?->email_verified_at);
        $this->assertSame(['version' => 1, 'stars' => 3], $this->data($keep, GameDataScope::Level, '1'));
        $this->assertDatabaseCount('email_change_requests', 0);
    }

    public function test_an_address_held_by_an_unconfirmed_account_is_refused_not_merged(): void
    {
        $keep = User::factory()->create();
        $other = User::factory()->create(['email' => 'claimed@example.test', 'email_verified_at' => null]);

        $this->actingAs($keep)->post('/account/email', ['email' => 'claimed@example.test']);
        $this->actingAs($keep)->get('/account/email/confirm/'.$this->tokenSentTo('claimed@example.test'))->assertSessionHas('error');

        $this->actingAs($keep)->post('/account/merge')->assertSessionHas('error');
        $this->assertModelExists($other);
    }

    public function test_a_merge_offer_cannot_be_redirected_at_an_address_that_was_never_confirmed(): void
    {
        // The attacker controls their own second account's mailbox, and knows a victim's address.
        $attacker = User::factory()->create(['email' => 'attacker@example.test']);
        User::factory()->create(['email' => 'attacker-alt@example.test', 'email_verified_at' => now()]);
        $victim = User::factory()->create(['email' => 'victim@example.test', 'email_verified_at' => now()]);
        $this->row($victim, GameDataScope::Level, '1', ['version' => 1, 'stars' => 3]);

        $this->actingAs($attacker)->post('/account/email', ['email' => 'attacker-alt@example.test']);
        $this->actingAs($attacker)->get('/account/email/confirm/'.$this->tokenSentTo('attacker-alt@example.test'));
        // A new request for the victim's address, whose link the attacker never opens.
        $this->actingAs($attacker)->post('/account/email', ['email' => 'victim@example.test']);

        $this->actingAs($attacker)->post('/account/merge')->assertSessionHas('error');

        $this->assertModelExists($victim);
        $this->assertSame('victim@example.test', $victim->fresh()?->email);
        $this->assertSame(['version' => 1, 'stars' => 3], $this->data($victim, GameDataScope::Level, '1'));
        $this->assertSame('attacker@example.test', $attacker->fresh()?->email);
        $this->actingAs($attacker)->get('/account')->assertOk()->assertDontSee('Merge your other account?');
    }

    public function test_a_merge_offer_expires_and_can_be_declined(): void
    {
        $keep = User::factory()->create(['email' => 'mine@example.test']);
        $other = User::factory()->create(['email' => 'shared@example.test', 'email_verified_at' => now()]);
        $this->actingAs($keep)->post('/account/email', ['email' => 'shared@example.test']);
        $this->actingAs($keep)->get('/account/email/confirm/'.$this->tokenSentTo('shared@example.test'));

        $this->actingAs($keep)->delete('/account/merge')->assertSessionHas('status');
        $this->actingAs($keep)->post('/account/merge')->assertSessionHas('error');
        $this->assertModelExists($other);

        $this->actingAs($keep)->post('/account/email', ['email' => 'shared@example.test']);
        $this->actingAs($keep)->get('/account/email/confirm/'.$this->tokenSentTo('shared@example.test', last: true));
        $this->travel(16)->minutes();
        $this->actingAs($keep)->post('/account/merge')->assertSessionHas('error');
        $this->assertModelExists($other);
        $this->assertSame('mine@example.test', $keep->fresh()?->email);
    }

    public function test_the_merge_command_merges_by_id_and_refuses_unsafe_merges(): void
    {
        $keep = User::factory()->create();
        $absorb = User::factory()->create();
        $this->row($absorb, GameDataScope::Level, '1', ['version' => 1, 'stars' => 2]);

        $this->artisan('users:merge', ['keep' => $keep->getKey(), 'absorb' => $absorb->getKey(), '--force' => true])->assertSuccessful();
        $this->assertModelMissing($absorb);
        $this->assertSame(['version' => 1, 'stars' => 2], $this->data($keep, GameDataScope::Level, '1'));
        $this->assertSame(AccessAudit::METHOD_CONSOLE, AuthAuditLog::query()->where('event', AccessAudit::ACCOUNTS_MERGED)->sole()->auth_method);

        $admin = User::factory()->administrator()->create();
        $this->artisan('users:merge', ['keep' => $keep->getKey(), 'absorb' => $admin->getKey(), '--force' => true])->assertFailed();
        $this->assertModelExists($admin);
        $this->assertSame(0, EmailChangeRequest::query()->count());
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function row(User $user, GameDataScope $scope, string $slot, array $data, int $minutesAgo = 0, bool $deleted = false): UserGameData
    {
        return UserGameData::factory()->for($user)->create([
            'game' => GameSlug::ChicksChallenge, 'scope' => $scope, 'slot' => $slot, 'data' => $data,
            'is_deleted' => $deleted, 'revision' => 3, 'updated_at' => now()->subMinutes($minutesAgo),
        ]);
    }

    /**
     * @return array<mixed>
     */
    private function data(User $user, GameDataScope $scope, string $slot): array
    {
        return UserGameData::query()->where('user_id', $user->getKey())->where('scope', $scope)->where('slot', $slot)->sole()->data;
    }

    private function event(User $user, string $clientEventId, int $sequence, ?\DateTimeInterface $acceptedAt = null): void
    {
        DB::table('mandarin_practice_events')->insert([
            'user_id' => $user->getKey(), 'client_event_id' => $clientEventId, 'sequence' => $sequence,
            'course_id' => 'course', 'content_version' => 'v1', 'kind' => 'answer', 'mode' => 'practice',
            'payload_hash' => str_repeat('0', 64), 'payload' => '{}', 'accepted_at' => $acceptedAt ?? now(),
        ]);
    }

    private function tokenSentTo(string $address, bool $last = false): string
    {
        $urls = [];
        Notification::assertSentOnDemand(ConfirmEmailAddress::class, function (ConfirmEmailAddress $notification, array $channels, AnonymousNotifiable $notifiable) use ($address, &$urls): bool {
            if ($notifiable->routes['mail'] === $address) {
                $urls[] = $notification->toMail($notifiable)->actionUrl;
            }

            return $notifiable->routes['mail'] === $address;
        });

        return basename((string) parse_url((string) ($last ? end($urls) : $urls[0]), PHP_URL_PATH));
    }
}
