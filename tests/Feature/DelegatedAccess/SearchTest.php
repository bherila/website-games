<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;
use BWH\Auth\OAuth\PendingAccount;

/**
 * `subjects` with a `query`: the unfiltered listing, filtered on name and address, case-insensitive,
 * in the same pages, with a cursor that belongs to its search.
 */
class SearchTest extends DelegatedAccessTestCase
{
    public function test_a_search_matches_name_or_address_case_insensitively(): void
    {
        $this->named('by-name', 'Example Walker', 'w1@example.test');
        $this->named('by-address', 'Someone', 'ExampleWalker@example.test');
        $this->named('neither', 'Another Player', 'w3@example.test');

        $this->assertSame(['by-name', 'by-address'], $this->search('WALKER'));
        $this->assertSame(['by-address'], $this->search('examplewalker'));
        $this->assertSame(['by-name'], $this->search('LE WAL'));
        $this->assertSame(['by-address'], $this->search('walker@EXAMPLE'));
        $this->assertSame([], $this->search('nobody-here'));
    }

    public function test_a_search_never_reaches_beyond_the_unfiltered_listing(): void
    {
        $this->named('listed', 'Example Match', 'listed@example.test');
        // Matching rows that are not addressable here: unbound, and bound under another provider.
        User::factory()->create(['name' => 'Example Match Unbound']);
        $this->account('elsewhere', provider: 'another-provider')->forceFill(['name' => 'Example Match Elsewhere'])->save();

        $this->assertSame(['listed'], $this->search('example match'));
        $this->assertDelegatedSearchStaysInScope(self::MANAGER, 'subjects', 'Example Match', 'Match Unbound');
    }

    public function test_placeholder_addresses_are_not_searchable(): void
    {
        $this->delegatedAccessCall(self::MANAGER, $this->provisioning('newcomer', displayName: 'Pending Example'));
        $this->assertStringEndsWith('@invalid', PendingAccount::email(self::PROVIDER, 'newcomer'));

        $this->assertSame([], $this->search('invalid'));
        $this->assertSame([], $this->search('sso-'));
        $this->assertSame(['newcomer'], $this->search('pending'));
    }

    public function test_wildcards_in_a_query_are_literal(): void
    {
        $this->named('percent', '100% Example', 'p@example.test');
        $this->named('plain', '1000 Example', 'q@example.test');
        $this->named('bang', 'Example!', 'r@example.test');

        $this->assertSame(['percent'], $this->search('0% e'));
        $this->assertSame([], $this->search('1_0'));
        $this->assertSame(['bang'], $this->search('le!'));
    }

    public function test_a_search_pages_with_a_cursor_bound_to_it(): void
    {
        foreach (range(1, 3) as $n) {
            $this->named("match-{$n}", "Zebra {$n}", "m{$n}@example.test");
        }
        $this->named('other', 'Different', 'd@example.test');

        $first = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'query' => 'zebra', 'limit' => 2]);
        $this->assertSame(['match-1', 'match-2'], array_column($first['subjects'], 'subject'));
        $this->assertIsString($first['next_cursor']);

        $second = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'query' => 'zebra', 'limit' => 2, 'cursor' => $first['next_cursor']]);
        $this->assertSame(['match-3'], array_column($second['subjects'], 'subject'));
        $this->assertNull($second['next_cursor']);

        // The cursor belongs to its search: not to another one, and not to the unfiltered listing.
        foreach ([['query' => 'different'], []] as $other) {
            $this->assertSame(DelegatedRefusal::INVALID_CURSOR, $this->refusal(self::MANAGER, ['operation' => 'subjects', 'limit' => 2, 'cursor' => $first['next_cursor'], ...$other]));
        }
    }

    public function test_workspaces_search_is_empty_and_a_player_may_not_search(): void
    {
        $this->named('player-subject', 'Example Player', 'player@example.test', administrator: false);

        $this->assertDelegatedSearchStaysInScope(self::MANAGER, 'workspaces', 'Example', 'Nothing');
        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal('player-subject', ['operation' => 'subjects', 'query' => 'example']));
    }

    private function named(string $subject, string $name, string $email, bool $administrator = false): User
    {
        $user = $this->account($subject, $administrator);
        $user->forceFill(['name' => $name, 'email' => $email])->save();

        return $user;
    }

    /**
     * @return list<string>
     */
    private function search(string $query): array
    {
        $page = $this->delegatedAccessCall(self::MANAGER, ['operation' => 'subjects', 'query' => $query, 'limit' => 50]);
        $this->assertNull($page['next_cursor']);

        return array_column($page['subjects'], 'subject');
    }
}
