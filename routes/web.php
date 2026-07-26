<?php

use App\Http\Controllers\GamePwaController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect()->route('games.index');
});

Route::get('/sw.js', [GamePwaController::class, 'serviceWorker'])
    ->name('games.service-worker');

Route::get('/games', function () {
    return view('games.index');
})->name('games.index');

Route::get('/games/parking-pickup', function () {
    return view('games.cars');
})->name('games.parking-pickup');

Route::get('/games/marble-sort', function () {
    return view('games.marble-sort');
})->name('games.marble-sort');

Route::get('/games/block-blaster', function () {
    return view('games.block-blaster');
})->name('games.block-blaster');

Route::get('/games/math-horde', function () {
    return view('games.math-horde');
})->name('games.math-horde');

Route::get('/games/hover', function () {
    return view('games.hover');
})->name('games.hover');

Route::get('/games/chicks-challenge', function () {
    return view('games.chicks-challenge');
})->name('games.chicks-challenge');

Route::get('/games/tower-throwback', function () {
    return view('games.tower-throwback');
})->name('games.tower-throwback');

Route::get('/games/2048', function () {
    return view('games.2048');
})->name('games.2048');
