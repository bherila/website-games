<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Account\GoogleAccounts;
use App\Services\Account\GoogleSignInRefused;
use App\Services\Account\SignInMethod;
use BWH\Auth\OAuth\Session\ProviderBindingResolver;
use BWH\Auth\OAuth\Session\ProviderIdentityEnforcement;
use BWH\Auth\OAuth\Session\ProviderObservation;
use BWH\Auth\OAuth\Session\ProviderSession;
use BWH\Auth\OAuth\Session\ProviderSessionExpired;
use BWH\Auth\OAuth\Session\ProviderStatusUnavailable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as GoogleUser;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirect;
use Throwable;

/**
 * "Continue with Google", for games only. Google players never touch the identity provider, so
 * they reach none of its other applications. See GoogleAccounts for how a sign-in finds its
 * account.
 */
class GoogleLoginController extends Controller
{
    public static function enabled(): bool
    {
        return filled(config('services.google.client_id')) && filled(config('services.google.client_secret'));
    }

    public function redirect(): SymfonyRedirect
    {
        abort_unless(self::enabled(), 404);

        // The driver asks for exactly `openid profile email` and reads the v3 userinfo
        // endpoint, whose `email_verified` the callback relies on.
        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request, GoogleAccounts $accounts): RedirectResponse
    {
        abort_unless(self::enabled(), 404);

        try {
            /** @var GoogleUser $google */
            $google = Socialite::driver('google')->user();
        } catch (InvalidStateException) {
            return redirect()->route('login')->with('error', 'That Google sign-in expired. Try again.');
        } catch (Throwable $failure) {
            report($failure);

            return redirect()->route('login')->with('error', 'Google sign-in did not complete. Try again.');
        }

        try {
            // A first-time Google link and its audit record commit only after provider
            // verification succeeds. A refusal or outage must not leave a new sign-in method.
            [$user, $observation] = DB::transaction(function () use ($accounts, $google): array {
                $user = $accounts->resolve(
                    (string) $google->getId(),
                    $google->getEmail(),
                    ($google->getRaw()['email_verified'] ?? false) === true,
                    $google->getName(),
                );

                return [$user, $this->observeProvider($user)];
            });
        } catch (GoogleSignInRefused $refusal) {
            return redirect()->route('login')->with('error', $refusal->getMessage());
        } catch (ProviderSessionExpired) {
            return redirect()->route('login')->with('error', 'This account can no longer sign in. Sign in with bherila ID for details.');
        } catch (ProviderStatusUnavailable) {
            abort(503, 'Sign-in verification is unavailable. Please retry.', ['Retry-After' => '30', 'Cache-Control' => 'private, no-store']);
        }

        // A new sign-in inherits nothing from whoever was signed in on this browser before, such
        // as the identity provider's list of their other applications; only the page to return
        // to is kept.
        $intended = $request->session()->pull('url.intended');
        $request->session()->invalidate();
        $guard = Auth::guard();
        $providerSession = app(ProviderSession::class);
        if ($observation !== null) {
            $providerSession->prepareRememberedLogin($request, $guard, $user,
                $observation->provider, $observation->subject, $observation->generation, $observation->epoch);
        }
        Auth::login($user, remember: true);
        if ($observation !== null) {
            $providerSession->establishObserved($request, $guard, $observation, (string) $user->name, (string) $user->email);
        }
        SignInMethod::remember($request->session(), SignInMethod::GOOGLE);
        if (is_string($intended)) {
            $request->session()->put('url.intended', $intended);
        }

        return redirect()->intended('/');
    }

    /**
     * The identity provider's current answer for a bound account, or null for a Google-only
     * account. With enforcement off any failure returns null and the sign-in proceeds as before.
     *
     * @throws ProviderSessionExpired the identity has ended (enforcement on)
     * @throws ProviderStatusUnavailable the provider cannot answer (enforcement on)
     */
    private function observeProvider(User $user): ?ProviderObservation
    {
        try {
            $binding = app(ProviderBindingResolver::class)->binding($user);
        } catch (ProviderSessionExpired $broken) {
            if (app(ProviderIdentityEnforcement::class)->enabled()) {
                throw $broken;
            }

            return null;
        }

        return $binding === null ? null : app(ProviderSession::class)->observe($binding);
    }
}
