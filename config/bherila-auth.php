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
];
