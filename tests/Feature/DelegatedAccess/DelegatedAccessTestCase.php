<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedAccessException;
use BWH\Auth\Testing\AssertsDelegatedAccessAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Drives the real adapter against the real tables the way the endpoint does: the request context
 * bound, every answer validated against contract version 2 and against the capabilities.
 *
 * Every test starts with one administrator, `manager-subject`, who can sign in.
 */
abstract class DelegatedAccessTestCase extends TestCase
{
    use AssertsDelegatedAccessAdapter;
    use RefreshDatabase;

    protected const PROVIDER = 'bherila';

    protected const MANAGER = 'manager-subject';

    protected User $manager;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('bherila-auth.oauth_client.provider', self::PROVIDER);
        Config::set('bherila-auth.delegated_access.application', 'example-app');
        Config::set('bherila-auth.delegated_access.issuer', 'https://identity.example.test');

        $this->manager = $this->account(self::MANAGER, administrator: true);
    }

    /**
     * Read straight from `users`, by the binding sign-in resolves, never through the adapter.
     */
    protected function delegatedAccessTruth(string $subject): array
    {
        $row = DB::table('users')->where('oauth_provider', self::PROVIDER)->where('oauth_subject', $subject)->first();

        return ['application_admin' => $row !== null && (bool) $row->is_admin, 'workspaces' => []];
    }

    protected function delegatedAccessManager(): string
    {
        return self::MANAGER;
    }

    /** An account bound to `$subject`, as sign-in or `oauth:bind-subject` leaves it. */
    protected function account(string $subject, bool $administrator = false, string $provider = self::PROVIDER): User
    {
        $user = User::factory()->create();
        $user->forceFill(['oauth_provider' => $provider, 'oauth_subject' => $subject, 'is_admin' => $administrator])->save();

        return $user->refresh();
    }

    /**
     * The outcome an operation is refused with.
     *
     * @param  array<string, mixed>  $payload
     */
    protected function refusal(string $actor, array $payload): string
    {
        try {
            $this->delegatedAccessCall($actor, $payload);
        } catch (DelegatedAccessException $refusal) {
            return $refusal->outcome;
        }

        $this->fail("Accepted {$payload['operation']} by {$actor}");
    }

    /**
     * @return array<string, mixed>
     */
    protected function setAdministrator(string $actor, string $target, bool $administrator, ?string $revision = null): array
    {
        $revision ??= $this->delegatedAccessRead($actor, $target)['revision'];

        return [
            'operation' => 'update',
            'subject' => $target,
            'expected_revision' => $revision,
            'access' => ['application_admin' => $administrator, 'workspaces' => []],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function provisioning(string $subject, bool $administrator = false, ?string $displayName = null): array
    {
        return [
            'operation' => 'update',
            'subject' => $subject,
            'expected_revision' => null,
            'access' => ['application_admin' => $administrator, 'workspaces' => []],
            ...($displayName === null ? [] : ['display_name' => $displayName]),
        ];
    }
}
