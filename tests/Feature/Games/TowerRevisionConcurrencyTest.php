<?php

namespace Tests\Feature\Games;

use App\Models\TowerSaveSlot;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class TowerRevisionConcurrencyTest extends TestCase
{
    private string $database;

    private string $driver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->database = tempnam(sys_get_temp_dir(), 'tower-revision-');
        $this->driver = getenv('TOWER_RACE_MYSQL') === '1' ? 'mysql' : 'sqlite';
        if ($this->driver === 'mysql') {
            if (getenv('CI') !== 'true') {
                throw new \RuntimeException('The isolated MySQL race fixture runs in CI only.');
            }
            config(['database.connections.mysql.host' => '127.0.0.1', 'database.connections.mysql.port' => 3306,
                'database.connections.mysql.database' => 'tower_revision_test', 'database.connections.mysql.username' => 'root',
                'database.connections.mysql.password' => '', 'database.connections.mysql.url' => null, 'database.connections.mysql.unix_socket' => '']);
        }
        config(['database.default' => $this->driver, 'database.connections.sqlite.database' => $this->database]);
        DB::purge($this->driver);
        Artisan::call('migrate:fresh', ['--database' => $this->driver, '--force' => true]);
    }

    protected function tearDown(): void
    {
        DB::disconnect($this->driver);
        foreach (glob($this->database.'*') ?: [] as $path) {
            unlink($path);
        }
        parent::tearDown();
    }

    /** Two independent PHP applications/connections start together, including the cold-slot case. */
    public function test_racing_first_creations_existing_writes_and_recreations_have_one_winner(): void
    {
        $user = User::factory()->create();
        foreach (['absent', 'existing', 'deleted'] as $state) {
            TowerSaveSlot::query()->delete();
            $slot = $state === 'absent' ? null : TowerSaveSlot::factory()->for($user)->create(['payload' => $state === 'deleted' ? null : ['version' => 2]]);
            $body = $this->write($slot?->content_revision ?? 'absent');
            $this->assertSame([200, 412], $this->race($user, ['PUT', $body, ''], ['PUT', $body, '']), $state);
            $this->assertSame(1, TowerSaveSlot::query()->count());
        }
    }

    public function test_delete_and_restore_fence_each_serialize_against_pending_writes(): void
    {
        $user = User::factory()->create();
        foreach (['DELETE', 'POST'] as $method) {
            TowerSaveSlot::query()->delete();
            $slot = TowerSaveSlot::factory()->for($user)->create();
            $condition = ['sync_protocol' => 2, 'expected_revision' => $slot->content_revision];
            $statuses = $this->race($user, [$method, $condition, $method === 'POST' ? '/restore' : ''], ['PUT', $this->write($slot->content_revision), '']);
            $this->assertSame(412, $statuses[1]);
            $this->assertContains($statuses[0], [200, 204]);
            $this->assertNotSame($slot->content_revision, $slot->fresh()->content_revision);
        }
    }

    private function write(string $revision): array
    {
        return ['sync_protocol' => 2, 'expected_revision' => $revision, 'lease_token' => 'same-device', 'wire_version' => 2, 'payload' => ['version' => 2, 'funds' => 22]];
    }

    /** @param array{string, array<string, mixed>, string} $first
     * @param  array{string, array<string, mixed>, string}  $second
     * @return list<int>
     */
    private function race(User $user, array $first, array $second): array
    {
        foreach (glob($this->database.'.*') ?: [] as $path) {
            unlink($path);
        }
        $processes = [];
        foreach ([$first, $second] as $i => [$method, $body, $suffix]) {
            $process = new Process([PHP_BINARY, '-d', 'memory_limit=1G', base_path('tests/Support/tower-revision-worker.php'), $this->database, (string) $user->getKey(), $method, json_encode($body, JSON_THROW_ON_ERROR), (string) $i, $suffix], base_path(), [
                'APP_ENV' => 'testing', 'APP_KEY' => config('app.key'), 'DB_CONNECTION' => $this->driver, 'DB_DATABASE' => $this->driver === 'mysql' ? 'tower_revision_test' : $this->database, 'DB_HOST' => '127.0.0.1', 'DB_PORT' => '3306', 'DB_USERNAME' => 'root', 'DB_PASSWORD' => '', 'DB_SOCKET' => '', 'DB_URL' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
            ]);
            $process->setTimeout(20)->start();
            $processes[] = $process;
        }
        $deadline = microtime(true) + 10;
        while (! is_file($this->database.'.ready.0') || ! is_file($this->database.'.ready.1')) {
            if (microtime(true) > $deadline) {
                $this->fail('Isolated request workers did not become ready.');
            }
            usleep(1000);
        }
        touch($this->database.'.start');
        $statuses = [];
        foreach ($processes as $process) {
            $this->assertSame(0, $process->wait(), $process->getErrorOutput());
            $statuses[] = (int) $process->getOutput();
        }
        sort($statuses);

        return $statuses;
    }
}
