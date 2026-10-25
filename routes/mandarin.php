<?php

use App\Http\Controllers\Admin\MandarinAudioAdminController;
use App\Http\Controllers\Api\Mandarin\MandarinAudioController;
use App\Http\Controllers\Api\Mandarin\MandarinBootstrapController;
use App\Http\Controllers\Api\Mandarin\MandarinEventsController;
use App\Http\Controllers\Api\Mandarin\MandarinMediaController;
use App\Http\Controllers\Api\Mandarin\MandarinProgressController;
use App\Http\Controllers\MandarinQaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Mandarin Quest routes
|--------------------------------------------------------------------------
|
| Loaded by App\Providers\MandarinServiceProvider. bootstrap/app.php wraps
| routes/web.php in the `web` middleware group and routes/api.php in the `api`
| group with an `/api` prefix; this file is outside both, so it applies the same
| two wrappers itself. Names, URIs and middleware are pinned by
| tests/Feature/Mandarin/MandarinRoutesTest.php.
*/

// Pages and media: what routes/web.php would have registered.
Route::middleware('web')->group(function (): void {
    Route::get('/mandarin', function () {
        return view('games.mandarin', ['runtime' => config('mandarin.runtime', 'live')]);
    })->name('games.mandarin');

    // Mock-backed preview with the scenario selector. Never available in production.
    Route::get('/mandarin/preview', function () {
        abort_if(app()->environment('production'), 404);

        return view('games.mandarin', ['runtime' => 'preview']);
    })->name('games.mandarin.preview');

    // Audition sheet for the whole course. Operator tool: the controller 404s for anyone
    // who is not an application administrator, and in production unless MANDARIN_QA_ENABLED is set.
    Route::get('/mandarin/qa', MandarinQaController::class)
        ->middleware(['web', 'auth', 'identity-provider-session'])
        ->name('games.mandarin.qa');

    Route::get('/media/games/mandarin/{asset}/{hash}.{extension}', [MandarinMediaController::class, 'show'])
        ->whereNumber('asset')->where(['hash' => '[a-f0-9]{64}', 'extension' => '(mp3|m4a|wav)'])
        ->name('games.mandarin.media');
});

// JSON endpoints: what routes/api.php would have registered (`api` group, `/api` prefix).
Route::middleware('api')->prefix('api')->group(function (): void {
    // Mandarin Quest. Bootstrap and audio resolution are session-aware but open to
    // guests (cache hits only); progress and events require the signed-in user.
    Route::middleware(['web', 'throttle:120,1'])->group(function (): void {
        Route::get('/games/mandarin/bootstrap', [MandarinBootstrapController::class, 'show'])->name('games.mandarin.bootstrap');
        Route::post('/games/mandarin/audio/resolve', [MandarinAudioController::class, 'resolve'])->name('games.mandarin.audio.resolve');
        Route::get('/games/mandarin/audio/requests/{request}', [MandarinAudioController::class, 'poll'])->whereNumber('request')->name('games.mandarin.audio.poll');
    });
    Route::middleware(['web', 'auth', 'throttle:120,1'])->group(function (): void {
        Route::get('/games/mandarin/progress', [MandarinProgressController::class, 'show'])->name('games.mandarin.progress');
        Route::post('/games/mandarin/events', [MandarinEventsController::class, 'store'])->name('games.mandarin.events');
    });

    // The admin panel's audio dashboard (/admin): application administrators only, in every
    // environment. The actions spend money, so they are POSTs (the web group's CSRF check) on a
    // tighter per-user throttle with its own counter (so the page polling the list cannot use up the
    // actions' allowance), and each one is idempotent.
    Route::middleware(['web', 'auth', 'identity-provider-session', 'can:administer'])->prefix('admin/mandarin/audio')->name('admin.mandarin.audio')->group(function (): void {
        Route::get('/', [MandarinAudioAdminController::class, 'index'])->middleware('throttle:120,1,admin-audio-list');
        Route::middleware('throttle:30,1,admin-audio-actions')->group(function (): void {
            Route::post('/request', [MandarinAudioAdminController::class, 'request'])->name('.request');
            Route::post('/regenerate', [MandarinAudioAdminController::class, 'regenerate'])->name('.regenerate');
            Route::post('/request-missing', [MandarinAudioAdminController::class, 'requestMissing'])->name('.request-missing');
            Route::post('/retry-failed', [MandarinAudioAdminController::class, 'retryFailed'])->name('.retry-failed');
        });
    });
});
