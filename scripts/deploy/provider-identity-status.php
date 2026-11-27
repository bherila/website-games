<?php

// Read-only operational diagnostic. Emit readiness flags only, never account or credential data.
try {
    require getcwd().'/vendor/autoload.php';
    $app = require getcwd().'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    if (! $app->environment('production')) {
        throw new RuntimeException('Wrong environment');
    }
    $enforcement = $app->make(BWH\Auth\OAuth\Session\ProviderIdentityEnforcement::class);
    $store = config('bherila-auth.provider_identity.cache_store') ?? config('cache.default');
    $driver = config('cache.stores.'.$store.'.driver');
    $clientConfigured = true;
    foreach (['provider', 'base_url', 'client_id', 'client_secret'] as $key) {
        $value = config('bherila-auth.oauth_client.'.$key);
        $clientConfigured = $clientConfigured && is_string($value) && trim($value) !== '';
    }
    echo json_encode([
        'configured' => $enforcement->configured(),
        'cutover_recorded' => $enforcement->cutOver(),
        'enforcement' => $enforcement->enabled(),
        'client_configured' => $clientConfigured,
        'cache_driver' => $driver,
        'cache_lock_capable' => Illuminate\Support\Facades\Cache::store($store)->getStore() instanceof Illuminate\Contracts\Cache\LockProvider,
        'shared_cache_candidate' => in_array($driver, ['database', 'redis', 'memcached', 'dynamodb'], true),
        // Configuration and unit tests do not establish a real disable/reset/session canary.
        'live_canary_verified' => false,
    ], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT).PHP_EOL;
} catch (Throwable) {
    fwrite(STDERR, "Provider identity status unavailable; inspect the server configuration privately.\n");
    exit(1);
}
