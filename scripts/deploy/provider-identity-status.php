<?php

use BWH\Auth\OAuth\Session\ProviderIdentityEnforcement;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;

// Read-only operational diagnostic. Emit readiness flags only, never account or credential data.
try {
    $identity = getcwd().'/public/deployment-identity.json';
    $before = is_file($identity) ? hash_file('sha256', $identity) : false;
    if ($before === false || is_file(getcwd().'/storage/framework/down')) {
        throw new RuntimeException('Deployment in progress');
    }
    require getcwd().'/vendor/autoload.php';
    $app = require getcwd().'/bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();
    if (! $app->environment('production')) {
        throw new RuntimeException('Wrong environment');
    }
    $enforcement = $app->make(ProviderIdentityEnforcement::class);
    $store = config('bherila-auth.provider_identity.cache_store') ?? config('cache.default');
    $driver = config('cache.stores.'.$store.'.driver');
    $clientConfigured = true;
    foreach (['provider', 'base_url', 'client_id', 'client_secret'] as $key) {
        $value = config('bherila-auth.oauth_client.'.$key);
        $clientConfigured = $clientConfigured && is_string($value) && trim($value) !== '';
    }
    $report = [
        'configured' => $enforcement->configured(),
        'cutover_recorded' => $enforcement->cutOver(),
        'enforcement' => $enforcement->enabled(),
        'client_configured' => $clientConfigured,
        'cache_driver' => $driver,
        'cache_lock_capable' => Cache::store($store)->getStore() instanceof LockProvider,
        'shared_cache_candidate' => in_array($driver, ['database', 'redis', 'memcached', 'dynamodb'], true),
        // Configuration and unit tests do not establish a real disable/reset/session canary.
        'live_canary_verified' => false,
    ];
    if (is_file(getcwd().'/storage/framework/down') || hash_file('sha256', $identity) !== $before) {
        throw new RuntimeException('Deployment changed during inspection');
    }
    echo json_encode($report, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT).PHP_EOL;
} catch (Throwable) {
    file_put_contents('php://stderr', "Provider identity status unavailable; inspect the server configuration privately.\n");
    exit(1);
}
