<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Operator-only surfaces. Being signed in is not enough: every account is created at
        // first sign-in, so the flag is the only thing that separates an operator from a player.
        Gate::define('administer', fn (User $user): bool => $user->isAdministrator());
    }
}
