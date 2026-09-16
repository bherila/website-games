<?php

declare(strict_types=1);

$scenario = getenv('VERIFY_SCENARIO') ?: 'success';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($scenario === 'endpoint_failure' && $path === '/mandarin') {
    http_response_code(503);
    echo 'unavailable';

    return;
}

if ($path === '/manifest.webmanifest') {
    header('Content-Type: '.($scenario === 'wrong_mime' ? 'text/plain' : 'application/manifest+json'));
    echo '{}';

    return;
}

if ($path === '/api/games/mandarin/bootstrap') {
    header('Content-Type: application/json');
    echo json_encode([
        'runtime' => $scenario === 'preview_runtime' ? 'preview' : 'live',
        'course' => [
            'courseId' => 'mandarin-foundations',
            'contentVersion' => $scenario === 'stale_course' ? '0.0.0' : '1.1.1',
        ],
        'audio' => [
            'courseId' => 'mandarin-foundations',
            'contentVersion' => $scenario === 'stale_course' ? '0.0.0' : '1.1.1',
        ],
    ], JSON_THROW_ON_ERROR);

    return;
}

if (in_array($path, ['/', '/up', '/mandarin'], true)) {
    header('Content-Type: text/html');
    echo '<!doctype html><title>Games</title>';

    return;
}

http_response_code(404);
