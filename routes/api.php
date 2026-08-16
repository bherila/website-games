<?php

use App\Http\Controllers\Api\GameDataController;
use App\Http\Controllers\Api\TowerSaveController;
use Illuminate\Support\Facades\Route;

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
