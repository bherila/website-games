<?php

return [
    'routes' => [
        'enabled' => false,
    ],

    // Every per-client limit keys on Request::ip(). Behind Cloudflare that is the
    // edge's address unless the edge is trusted, so all of an edge's callers would
    // share one budget. Only Cloudflare's published ranges are trusted by default;
    // a direct connection's forwarded headers are ignored. A deployment behind
    // another proxy lists it in TRUSTED_PROXIES; one with no proxy sets it empty.
    'trusted_proxies' => [
        'apply' => (bool) env('BHERILA_AUTH_TRUSTED_PROXIES', true),
        'trusted' => env('TRUSTED_PROXIES', 'cloudflare'),
        'cloudflare' => null,
    ],

    // The endpoint the identity provider calls to manage accounts here (delegated access,
    // contract version 2). App\Services\Admin\DelegatedApplicationAccess is the adapter. The
    // route answers 404 until enabled, and refuses every update until writes are enabled, so a
    // deployment starts read-only. See README "Delegated access" before turning either on.
    'delegated_access' => [
        'enabled' => filter_var(env('GAMES_DELEGATED_ACCESS_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        'writes_enabled' => filter_var(env('GAMES_DELEGATED_ACCESS_WRITES_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        // The provider's exact HTTPS issuer. Must equal the sign-in provider (OAUTH_PROVIDER_URL),
        // or every request is refused: subjects are resolved under the sign-in binding.
        'issuer' => env('GAMES_DELEGATED_ACCESS_ISSUER', ''),
        // This endpoint's exact HTTPS URL, as the provider is configured to call it.
        'endpoint' => env('GAMES_DELEGATED_ACCESS_ENDPOINT', ''),
        // This application's key in the provider's application registry.
        'application' => env('GAMES_DELEGATED_ACCESS_APPLICATION', ''),
        // The provider's integration public keys: `key-id|/path/to/public.pem`, comma-separated.
        'public_keys' => env('GAMES_DELEGATED_ACCESS_PUBLIC_KEYS', ''),
        // The raw OAUTH_PROVIDER, with no default: it must be set and match oauth_client.provider.
        'oauth_provider' => env('OAUTH_PROVIDER'),
        // The nonce table's connection; null for the default. Durable and shared by every worker.
        'nonce_connection' => env('GAMES_DELEGATED_ACCESS_NONCE_CONNECTION'),
        // The operation receipts table's connection; the nonce connection unless set. Durable and
        // shared by every worker: a lost receipt lets a repeated write run again.
        'receipt_connection' => env('GAMES_DELEGATED_ACCESS_RECEIPT_CONNECTION', env('GAMES_DELEGATED_ACCESS_NONCE_CONNECTION')),
    ],
];
