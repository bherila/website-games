<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedRefusal;

/**
 * The package's adapter conformance assertions, every one that applies to an account-only
 * application, against the real adapter and the real `users` table.
 */
class AdapterConformanceTest extends DelegatedAccessTestCase
{
    public function test_the_adapter_is_account_only(): void
    {
        $this->assertTrue($this->delegatedAccessAccountOnly());
        $this->assertSame(
            ['application_admin' => true, 'workspace_roles' => [], 'provisioning' => true],
            $this->delegatedAccessCapabilities()['controls'],
        );
        $this->assertSame(['workspaces' => [], 'next_cursor' => null], array_intersect_key(
            $this->delegatedAccessCall(self::MANAGER, ['operation' => 'workspaces', 'limit' => 50]),
            ['workspaces' => true, 'next_cursor' => true],
        ));
    }

    public function test_every_applicable_assertion_holds(): void
    {
        $this->account('other-admin-subject', administrator: true);
        $this->account('player-subject');
        $before = $this->snapshot();

        // An ordinary player, bound and able to sign in, learns nothing.
        $this->assertDelegatedActorRefusedEverywhere('player-subject', 'other-admin-subject');
        $this->assertDelegatedProtectedMembershipsHold(self::MANAGER, 'player-subject');
        // Self-demotion is refused, so this exercises the refusal rather than returning early.
        $this->assertDelegatedApplicationAdminFollowsAllowedEdits(self::MANAGER, self::MANAGER);
        $this->assertDelegatedApplicationAdminFollowsAllowedEdits(self::MANAGER, 'player-subject');
        $this->assertDelegatedApplicationAdminFollowsAllowedEdits(self::MANAGER, 'other-admin-subject');
        $this->assertDelegatedStaleRevisionRefused(self::MANAGER, 'player-subject');
        $this->assertDelegatedStaleRevisionRefused(self::MANAGER, 'other-admin-subject');
        $this->assertDelegatedUnadvertisedRoleRefused(self::MANAGER, 'player-subject');
        $this->assertDelegatedUpdateKeepsUnseenMemberships(self::MANAGER, 'player-subject');
        $this->assertDelegatedUpdateKeepsUnseenMemberships(self::MANAGER, self::MANAGER);

        // Every assertion ran to the end and changed nothing.
        $this->assertSame($before, $this->snapshot());
    }

    public function test_the_last_administrator_cannot_demote_themselves(): void
    {
        $this->account('player-subject');

        $this->assertFalse($this->delegatedAccessRead(self::MANAGER, self::MANAGER)['allowed_edits']['application_admin']);
        $this->assertDelegatedApplicationAdminFollowsAllowedEdits(self::MANAGER, self::MANAGER);
        $this->assertTrue($this->manager->refresh()->isAdministrator());
    }

    /**
     * Who may not manage access: not only ordinary players, but every account whose flag or
     * binding does not make it an administrator who can sign in here.
     */
    public function test_only_an_administrator_who_can_sign_in_may_ask_anything(): void
    {
        $this->account('player-subject');

        // The flag on a row bound under another provider is not this subject's.
        $this->account('elsewhere-subject', administrator: true, provider: 'another-provider');
        // A subject with no account here at all.
        $strangers = ['player-subject', 'elsewhere-subject', 'unknown-subject'];

        foreach ($strangers as $stranger) {
            $this->assertDelegatedActorRefusedEverywhere($stranger, 'player-subject');
        }

        // A demoted administrator is refused from the next request on.
        $this->account('former-admin-subject', administrator: true);
        $this->assertSame('capabilities', $this->delegatedAccessCall('former-admin-subject', ['operation' => 'capabilities'])['operation']);
        User::query()->where('oauth_subject', 'former-admin-subject')->update(['is_admin' => false]);
        $this->assertSame(DelegatedRefusal::NOT_AUTHORIZED, $this->refusal('former-admin-subject', ['operation' => 'capabilities']));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function snapshot(): array
    {
        return User::query()->orderBy('id')->get(['id', 'name', 'email', 'is_admin', 'oauth_provider', 'oauth_subject'])
            ->map(fn (User $user): array => $user->getAttributes())->all();
    }
}
