<?php

use App\Http\Controllers\Account\AccountController;
use App\Http\Controllers\Admin\AdminPanelController;
use App\Http\Controllers\GamePwaController;
use App\Http\Controllers\OAuthLoginController;
use Illuminate\Support\Facades\Route;

if (app()->environment('e2e')) {
    require __DIR__.'/e2e.php';
}

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

// The account page. Confirmation links require the same signed-in account, so a forwarded or
// intercepted link cannot change someone else's address.
Route::middleware('auth')->group(function (): void {
    Route::get('/account', [AccountController::class, 'show'])->name('account.show');
    Route::post('/account/email', [AccountController::class, 'requestEmail'])
        ->middleware('throttle:account-email-request')
        ->name('account.email.request');
    Route::get('/account/email/confirm/{token}', [AccountController::class, 'confirmEmail'])
        ->middleware('throttle:account-email-confirm')
        ->name('account.email.confirm');
});

// Routes are root-mounted (no '/games' prefix). Route *names* keep the 'games.'
// prefix as an internal identifier, separate from the user-facing URL.
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

Route::get('/marble-works', function () {
    return view('games.marble-works');
})->name('games.marble-works');

Route::view('/plate-escape', 'games.plate-escape')->name('games.plate-escape');

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

// Operator panel: application administrators only, in every environment. Guests are sent to
// sign in; a signed-in account without the flag gets 403. Its JSON lives in routes/api.php.
Route::get('/admin', AdminPanelController::class)
    ->middleware(['auth', 'can:administer'])
    ->name('admin.index');

Route::get('/2048', function () {
    return view('games.2048');
})->name('games.2048');
