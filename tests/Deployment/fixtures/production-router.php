<?php

declare(strict_types=1);

if (ini_get('memory_limit') !== '1G') {
    http_response_code(500);
    echo 'Fixture PHP requires memory_limit=1G';

    return;
}

$scenario = getenv('VERIFY_SCENARIO') ?: 'success';
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);

// Redirect scenarios send one probed path elsewhere. The redirect target is served from
// this same fixture under a /redirected prefix, so a client that follows the redirect gets
// a fully valid response: a rejection can only come from the redirect's protocol.
if (is_string($path) && str_starts_with($path, '/redirected/')) {
    $path = substr($path, strlen('/redirected'));
} elseif (preg_match('/^(http|ftp)_redirect:(\/.*)$/', $scenario, $redirect) === 1 && $path === $redirect[2]) {
    $port = (int) ($_SERVER['SERVER_PORT'] ?? 80);
    http_response_code(302);
    header('Location: '.$redirect[1].'://127.0.0.1:'.$port.'/redirected'.$requestUri);

    return;
}

$htmlPage = static function (): void {
    header('Content-Type: text/html');
    echo '<!doctype html><title>Games</title>';
};

// The page briefly answers a probed path with HTML before the real file, as after maintenance (#156).
if (preg_match('/^transient_html:(\/.*)$/', $scenario, $transient) === 1 && $path === $transient[1]) {
    $counter = (getenv('VERIFY_COUNTER_DIR') ?: sys_get_temp_dir()).'/transient-'.md5($path);
    $served = is_file($counter) ? (int) file_get_contents($counter) : 0;
    if ($served < 2) {
        file_put_contents($counter, (string) ($served + 1));
        $htmlPage();

        return;
    }
}

// A cache keeps answering HTML unless the request asks it not to.
$noCache = str_contains(strtolower((string) ($_SERVER['HTTP_CACHE_CONTROL'] ?? '')), 'no-cache');
if ($path === '/deployment-identity.json' && ($scenario === 'html_identity' || ($scenario === 'cached_html_identity' && ! $noCache))) {
    $htmlPage();

    return;
}

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

if ($path === '/deployment-identity.json') {
    header('Content-Type: application/json');
    echo json_encode([
        'source_commit' => $scenario === 'stale_deployment' ? 'bbbbbbbb' : 'aaaaaaaa',
    ], JSON_THROW_ON_ERROR);

    return;
}

if ($path === '/api/games/mandarin/bootstrap') {
    header('Content-Type: application/json');
    echo json_encode([
        'runtime' => $scenario === 'preview_runtime' ? 'preview' : 'live',
        'course' => [
            'courseId' => 'mandarin-foundations',
            'contentVersion' => $scenario === 'stale_course' ? '1.1.1' : '1.2.0',
        ],
        'audio' => [
            'courseId' => 'mandarin-foundations',
            'contentVersion' => $scenario === 'stale_course' ? '1.1.1' : '1.2.0',
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
