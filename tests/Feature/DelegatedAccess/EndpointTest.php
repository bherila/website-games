<?php

namespace Tests\Feature\DelegatedAccess;

use App\Models\User;
use App\Services\Admin\DelegatedApplicationAccess;
use BWH\Auth\OAuth\DelegatedAccess\ApplicationAccessAdapter;
use BWH\Auth\OAuth\DelegatedAccess\DelegatedContract;
use BWH\Auth\OAuth\DelegatedAccess\NonceStore;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Config;
use Illuminate\Testing\TestResponse;
use Lcobucci\JWT\Encoding\ChainedFormatter;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Token\Builder;
use Tests\TestCase;

/**
 * POST /application-access wired to this application's adapter, driven as the provider drives
 * it: an RS256 actor assertion bound to the exact body. Off by default, and read-only once on
 * until writes are enabled separately.
 */
class EndpointTest extends TestCase
{
    use RefreshDatabase;

    private const ISSUER = 'https://identity.example.test';

    private const ENDPOINT = 'https://games.example.test/application-access';

    private const APPLICATION = 'example-app';

    private string $privateKey = '';

    private string $keyPath = '';

    protected function setUp(): void
    {
        parent::setUp();

        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $this->assertNotFalse($key);
        openssl_pkey_export($key, $this->privateKey);
        $this->keyPath = (string) tempnam(sys_get_temp_dir(), 'delegated-public-');
        file_put_contents($this->keyPath, openssl_pkey_get_details($key)['key'] ?? '');

        // Everything the verifier needs, but not `enabled` or `writes_enabled`: those keep the
        // values this application's config file gives them unless a test says otherwise.
        Config::set('bherila-auth.oauth_client.provider', 'bherila');
        Config::set('bherila-auth.oauth_client.base_url', self::ISSUER);
        Config::set('bherila-auth.delegated_access.issuer', self::ISSUER);
        Config::set('bherila-auth.delegated_access.endpoint', self::ENDPOINT);
        Config::set('bherila-auth.delegated_access.application', self::APPLICATION);
        Config::set('bherila-auth.delegated_access.public_keys', 'integration-v1|'.$this->keyPath);
        Config::set('bherila-auth.delegated_access.oauth_provider', 'bherila');

        // The database store refuses in-memory SQLite, rightly; the package's own tests cover it.
        $this->app->instance(NonceStore::class, new class implements NonceStore
        {
            /** @var array<string, true> */
            private array $seen = [];

            public function consume(string $key, int $seconds): bool
            {
                if (isset($this->seen[$key])) {
                    return false;
                }

                return $this->seen[$key] = true;
            }
        });

        $this->bound('admin-subject', administrator: true);
        $this->bound('player-subject');
    }

    protected function tearDown(): void
    {
        @unlink($this->keyPath);

        parent::tearDown();
    }

    public function test_the_adapter_is_bound_and_the_endpoint_is_off_by_default(): void
    {
        $this->assertInstanceOf(DelegatedApplicationAccess::class, $this->app->make(ApplicationAccessAdapter::class));
        $this->assertFalse(config('bherila-auth.delegated_access.enabled'));
        $this->assertFalse(config('bherila-auth.delegated_access.writes_enabled'));

        // Even a properly signed request from an administrator: a disabled endpoint looks absent.
        $this->send('admin-subject', ['operation' => 'capabilities'])
            ->assertNotFound()
            ->assertExactJson(['error' => 'not_found']);
    }

    public function test_once_enabled_it_answers_reads_and_refuses_writes_until_they_are_enabled(): void
    {
        Config::set('bherila-auth.delegated_access.enabled', true);

        $this->send('admin-subject', ['operation' => 'capabilities'])
            ->assertOk()
            ->assertHeaderContains('Cache-Control', 'no-store')
            ->assertJsonPath('controls', ['application_admin' => true, 'workspace_roles' => [], 'provisioning' => true]);

        $revision = $this->send('admin-subject', ['operation' => 'read', 'subject' => 'player-subject'])->assertOk()->json('revision');
        $this->send('admin-subject', $this->grant('player-subject', $revision))
            ->assertForbidden()
            ->assertExactJson(['error' => 'not_authorized']);
        $this->send('admin-subject', ['operation' => 'update', 'subject' => 'newcomer', 'expected_revision' => null, 'access' => ['application_admin' => false, 'workspaces' => []], 'operation_id' => DelegatedContract::operationId()])
            ->assertForbidden();

        $this->assertFalse($this->user('player-subject')->isAdministrator());
        $this->assertSame(0, User::query()->where('oauth_subject', 'newcomer')->count());
    }

    public function test_with_writes_enabled_an_administrator_changes_access(): void
    {
        Config::set('bherila-auth.delegated_access.enabled', true);
        Config::set('bherila-auth.delegated_access.writes_enabled', true);

        $revision = $this->send('admin-subject', ['operation' => 'read', 'subject' => 'player-subject'])->assertOk()->json('revision');
        $this->send('admin-subject', $this->grant('player-subject', $revision))
            ->assertOk()
            ->assertJsonPath('access', ['application_admin' => true, 'workspaces' => []]);

        $this->assertTrue($this->user('player-subject')->isAdministrator());
    }

    public function test_a_removal_is_a_write_and_its_receipt_answers_a_repeat(): void
    {
        $this->bound('other-admin-subject', administrator: true);
        Config::set('bherila-auth.delegated_access.enabled', true);

        $revision = $this->send('admin-subject', ['operation' => 'read', 'subject' => 'other-admin-subject'])
            ->assertOk()->assertJsonPath('allowed_edits.remove', true)->json('revision');
        $remove = ['operation' => 'remove', 'subject' => 'other-admin-subject', 'expected_revision' => $revision, 'operation_id' => DelegatedContract::operationId()];

        // Read-only until writes are enabled, removal included.
        $this->send('admin-subject', $remove)->assertForbidden()->assertExactJson(['error' => 'not_authorized']);
        $this->assertTrue($this->user('other-admin-subject')->isAdministrator());

        Config::set('bherila-auth.delegated_access.writes_enabled', true);
        $remove['operation_id'] = DelegatedContract::operationId();
        $first = $this->send('admin-subject', $remove)
            ->assertOk()
            ->assertJsonPath('provisioned', true)
            ->assertJsonPath('access', ['application_admin' => false, 'workspaces' => []]);
        $this->assertFalse($this->user('other-admin-subject')->isAdministrator());

        // A retry of the same user action is answered from the receipt, not decided again (the
        // revision it carries is stale by now, so deciding again would be a conflict).
        $this->assertSame($first->getContent(), $this->send('admin-subject', $remove)->assertOk()->getContent());
        $this->send('admin-subject', ['operation' => 'receipt', 'operation_id' => $remove['operation_id']])
            ->assertOk()
            ->assertJsonPath('status', 'known')
            ->assertJsonPath('response_status', 200);
    }

    public function test_a_player_is_refused_through_the_endpoint(): void
    {
        Config::set('bherila-auth.delegated_access.enabled', true);
        Config::set('bherila-auth.delegated_access.writes_enabled', true);

        $this->send('player-subject', ['operation' => 'capabilities'])->assertForbidden()->assertExactJson(['error' => 'not_authorized']);
        $this->send('player-subject', $this->grant('player-subject', 'any-revision'))->assertForbidden();
        $this->assertFalse($this->user('player-subject')->isAdministrator());
    }

    /**
     * @return array<string, mixed>
     */
    private function grant(string $subject, string $revision): array
    {
        return ['operation' => 'update', 'subject' => $subject, 'expected_revision' => $revision, 'access' => ['application_admin' => true, 'workspaces' => []], 'operation_id' => DelegatedContract::operationId()];
    }

    private function bound(string $subject, bool $administrator = false): void
    {
        User::factory()->create()->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => $subject, 'is_admin' => $administrator])->save();
    }

    private function user(string $subject): User
    {
        return User::query()->where('oauth_provider', 'bherila')->where('oauth_subject', $subject)->sole();
    }

    /**
     * @param  array<string, mixed>  $input
     * @return TestResponse<Response>
     */
    private function send(string $actor, array $input): TestResponse
    {
        $body = (string) json_encode(['contract_version' => DelegatedContract::VERSION_3, 'application' => self::APPLICATION, ...$input], JSON_UNESCAPED_SLASHES);

        return $this->call('POST', '/application-access', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$this->assertion($actor, $body),
        ], $body);
    }

    private function assertion(string $subject, string $body): string
    {
        $now = new DateTimeImmutable('@'.time());

        return Builder::new(new JoseEncoder, ChainedFormatter::withUnixTimestampDates())
            ->withHeader('typ', 'application-access+jwt')
            ->withHeader('kid', 'integration-v1')
            ->issuedBy(self::ISSUER)->relatedTo($subject)->permittedFor(self::ENDPOINT)
            ->issuedAt($now)->expiresAt($now->modify('+60 seconds'))
            ->identifiedBy(bin2hex(random_bytes(32)))
            ->withClaim('application', self::APPLICATION)
            ->withClaim('method', 'POST')
            ->withClaim('body_sha256', hash('sha256', $body))
            ->getToken(new Sha256, InMemory::plainText($this->privateKey))
            ->toString();
    }
}
