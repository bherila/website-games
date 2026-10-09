<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Admin\DelegatedApplicationAccess;
use BWH\Auth\OAuth\DelegatedAccess\ApplicationAccessAdapter;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Binding the adapter is what registers the delegated access route. It still answers
        // 404 until GAMES_DELEGATED_ACCESS_ENABLED, and refuses updates until writes are enabled.
        // bind(), not singleton(): the adapter is built per call, inside the request context.
        $this->app->bind(ApplicationAccessAdapter::class, DelegatedApplicationAccess::class);
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
