<?php

use App\Http\Controllers\GamePwaController;
use App\Http\Controllers\OAuthLoginController;
use Illuminate\Support\Facades\Route;

Route::get('/login', function () {
    return view('login');
})->name('login');
Route::get('/oauth/redirect', [OAuthLoginController::class, 'redirect'])
    ->middleware('throttle:20,1')
    ->name('oauth.redirect');
Route::get('/oauth/callback', [OAuthLoginController::class, 'callback'])
    ->middleware('throttle:20,1')
    ->name('oauth.callback');
Route::post('/logout', [OAuthLoginController::class, 'logout'])
    ->middleware('auth')
    ->name('logout');

// Routes are root-mounted (no '/games' prefix). This app has no PWA installs
// yet to preserve, so the owner had the '/games' prefix dropped in a follow-up
// to bherila/2025-website#1803 rather than carrying it forward for stability
// it didn't need. Route *names* keep the 'games.' prefix — that's an internal
// identifier, not a URL, and changing it would be pure churn.
Route::get('/sw.js', [GamePwaController::class, 'serviceWorker'])
    ->name('games.service-worker');

Route::get('/', function () {
    return view('games.index');
})->name('games.index');

Route::get('/parking-pickup', function () {
    return view('games.cars');
})->name('games.parking-pickup');

Route::get('/marble-sort', function () {
    return view('games.marble-sort');
})->name('games.marble-sort');

Route::get('/block-blaster', function () {
    return view('games.block-blaster');
})->name('games.block-blaster');

Route::get('/math-horde', function () {
    return view('games.math-horde');
})->name('games.math-horde');

Route::get('/hover', function () {
    return view('games.hover');
})->name('games.hover');

Route::get('/chicks-challenge', function () {
    return view('games.chicks-challenge');
})->name('games.chicks-challenge');

Route::get('/tower-throwback', function () {
    return view('games.tower-throwback');
})->name('games.tower-throwback');

Route::get('/2048', function () {
    return view('games.2048');
})->name('games.2048');
