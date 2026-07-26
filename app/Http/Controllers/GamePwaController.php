<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

class GamePwaController extends Controller
{
    public function serviceWorker(): BinaryFileResponse
    {
        return response()->file(public_path('build/sw.js'), [
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Content-Type' => 'application/javascript; charset=utf-8',
            'Service-Worker-Allowed' => '/',
        ]);
    }
}
