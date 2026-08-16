<?php

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::post('/__e2e/login', function (Request $request) {
    abort_unless(app()->environment('e2e'), 404);

    $expectedToken = config('e2e.auth_token');
    $providedToken = $request->header('X-E2E-Auth-Token');
    abort_unless(
        is_string($expectedToken)
        && $expectedToken !== ''
        && is_string($providedToken)
        && hash_equals($expectedToken, $providedToken),
        404,
    );

    $userId = filter_var(config('e2e.user_id'), FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1],
    ]);
    abort_if($userId === false, 500, 'E2E_USER_ID must be a positive integer.');

    Auth::login(User::query()->findOrFail($userId));
    $request->session()->regenerate();

    return response()->noContent();
});
