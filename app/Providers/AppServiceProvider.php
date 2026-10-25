<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Account\SignInMethod;
use App\Services\Admin\DelegatedApplicationAccess;
use BWH\Auth\OAuth\DelegatedAccess\ApplicationAccessAdapter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoTransportFactory;
use Symfony\Component\Mailer\Transport\Dsn;

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
        // A Google sign-in can open any account whose confirmed address it matches, so
        // administering also needs this session to have signed in through the identity provider.
        Gate::define('administer', fn (User $user): bool => $user->isAdministrator()
            && SignInMethod::viaIdentityProvider(request()->hasSession() ? request()->session() : null));

        // Named so each keeps its own counter: an unnamed `throttle:N,M` is keyed by the user
        // alone, so confirmation clicks and game-data saves would spend the email allowance.
        RateLimiter::for('account-email-request', fn (Request $request): Limit => Limit::perHour(5)->by((string) $request->user()?->getAuthIdentifier()));
        RateLimiter::for('account-email-confirm', fn (Request $request): Limit => Limit::perMinute(20)->by((string) $request->user()?->getAuthIdentifier()));

        $this->app->make(MailManager::class)->extend('brevo', fn () => (new BrevoTransportFactory)->create(
            Dsn::fromString((string) config('services.brevo.dsn')),
        ));
    }
}
