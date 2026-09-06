<?php

use App\Http\Controllers\Api\GameDataController;
use App\Http\Controllers\Api\Mandarin\MandarinAudioController;
use App\Http\Controllers\Api\Mandarin\MandarinBootstrapController;
use App\Http\Controllers\Api\Mandarin\MandarinEventsController;
use App\Http\Controllers\Api\Mandarin\MandarinProgressController;
use App\Http\Controllers\Api\TowerSaveController;
use Illuminate\Support\Facades\Route;

// NOTE: 'auth' here resolves to whatever web guard is configured. This app
// uses its own OAuth-backed identity.
Route::middleware(['web', 'auth', 'throttle:120,1'])->get('/games/data', [GameDataController::class, 'index']);
Route::middleware(['web', 'auth', 'throttle:120,1'])->put('/games/{game}/data', [GameDataController::class, 'batch']);
Route::middleware(['web', 'auth', 'throttle:120,1'])->put('/games/{game}/data/{scope}/{slot}', [GameDataController::class, 'update']);
Route::middleware(['web', 'auth', 'throttle:120,1'])->delete('/games/{game}/data/{scope}/{slot}', [GameDataController::class, 'destroy']);

Route::middleware(['web', 'auth', 'throttle:120,1'])->group(function (): void {
    Route::get('/games/tower-throwback/saves', [TowerSaveController::class, 'index']);
    Route::get('/games/tower-throwback/saves/{slot}', [TowerSaveController::class, 'show']);
    Route::put('/games/tower-throwback/saves/{slot}', [TowerSaveController::class, 'store']);
    Route::post('/games/tower-throwback/saves/{slot}/lease', [TowerSaveController::class, 'acquire']);
    Route::delete('/games/tower-throwback/saves/{slot}/lease', [TowerSaveController::class, 'release']);
    Route::delete('/games/tower-throwback/saves/{slot}', [TowerSaveController::class, 'destroy']);
});

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
