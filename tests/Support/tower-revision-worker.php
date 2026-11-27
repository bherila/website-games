<?php

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

// Only launched by TowerRevisionConcurrencyTest against its temporary isolated SQLite database.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || ! (config('database.default') === 'sqlite'
    ? str_starts_with((string) config('database.connections.sqlite.database'), sys_get_temp_dir().'/tower-revision-')
    : getenv('CI') === 'true' && getenv('TOWER_RACE_MYSQL') === '1' && config('database.connections.mysql.database') === 'tower_revision_test' && config('database.connections.mysql.host') === '127.0.0.1')) {
    exit(2);
}
config(['database.connections.sqlite.busy_timeout' => 10000, 'session.driver' => 'array', 'cache.default' => 'array']);
Auth::guard()->setUser(User::findOrFail((int) $argv[2]));
$body = json_decode($argv[4], true, flags: JSON_THROW_ON_ERROR);
file_put_contents($argv[1].'.ready.'.$argv[5], 'ready');
$deadline = microtime(true) + 10;
while (! is_file($argv[1].'.start')) {
    if (microtime(true) > $deadline) {
        exit(3);
    }
    usleep(1000);
}
$request = Request::create('/api/games/tower-throwback/saves/slot-a'.$argv[6], $argv[3], server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], content: json_encode($body, JSON_THROW_ON_ERROR));
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$response = $kernel->handle($request);
echo $response->getStatusCode();
$kernel->terminate($request, $response);
