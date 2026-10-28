<?php

use App\Http\Controllers\Account\AccountController;
use App\Http\Controllers\Admin\AdminPanelController;
use App\Http\Controllers\GamePwaController;
use App\Http\Controllers\GoogleLoginController;
use App\Http\Controllers\OAuthLoginController;
use App\Http\Controllers\Privacy\PrivacyRequestController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

if (app()->environment('e2e')) {
    require __DIR__.'/e2e.php';
}

Route::view('/privacy', 'privacy')->name('privacy');
Route::view('/accessibility', 'accessibility')->name('accessibility');
Route::post('/privacy/request', [PrivacyRequestController::class, 'store'])
    ->middleware('throttle:privacy-request')
    ->name('privacy.request');
Route::get('/login', function (Request $request) {
    // A page anyone can open (Tower 2, say) links here with ?next=/path so
    // sign-in returns to it. Only same-site paths are accepted.
    $next = $request->query('next');
    if (is_string($next) && preg_match('#^/(?![/\\\\])[A-Za-z0-9/_.-]*$#', $next) === 1) {
        $request->session()->put('url.intended', url($next));
    }

    return view('login');
})->name('login');
Route::get('/oauth/redirect', [OAuthLoginController::class, 'redirect'])
    ->middleware('throttle:20,1')
    ->name('oauth.redirect');
Route::get('/oauth/callback', [OAuthLoginController::class, 'callback'])
    ->middleware('throttle:20,1')
    ->name('oauth.callback');
Route::get('/oauth/google/redirect', [GoogleLoginController::class, 'redirect'])
    ->middleware('throttle:20,1,google-sign-in')
    ->name('oauth.google.redirect');
Route::get('/oauth/google/callback', [GoogleLoginController::class, 'callback'])
    ->middleware('throttle:20,1,google-sign-in')
    ->name('oauth.google.callback');
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
    Route::delete('/account', [AccountController::class, 'destroy'])
        ->middleware('throttle:5,1,account-delete')
        ->name('account.destroy');
    Route::post('/account/merge', [AccountController::class, 'merge'])
        ->middleware('throttle:5,1,account-merge')
        ->name('account.merge');
    Route::delete('/account/merge', [AccountController::class, 'cancelMerge'])->name('account.merge.cancel');
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

// Unlisted prototype: not in the catalog, the PWA shell list or the sitemap.
Route::view('/tower-2', 'games.tower-2')->name('games.tower-2');

// Operator panel: application administrators only, in every environment. Guests are sent to
// sign in; a signed-in account without the flag gets 403. Its JSON lives in routes/api.php.
Route::get('/admin', AdminPanelController::class)
    ->middleware(['auth', 'identity-provider-session', 'can:administer'])
    ->name('admin.index');

Route::get('/2048', function () {
    return view('games.2048');
})->name('games.2048');
