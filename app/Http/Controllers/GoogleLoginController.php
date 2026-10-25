<?php

namespace App\Http\Controllers;

use App\Services\Account\GoogleAccounts;
use App\Services\Account\GoogleSignInRefused;
use App\Services\Account\SignInMethod;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
            $user = $accounts->resolve(
                (string) $google->getId(),
                $google->getEmail(),
                ($google->getRaw()['email_verified'] ?? false) === true,
                $google->getName(),
            );
        } catch (GoogleSignInRefused $refusal) {
            return redirect()->route('login')->with('error', $refusal->getMessage());
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();
        SignInMethod::remember($request->session(), SignInMethod::GOOGLE);

        return redirect()->intended('/');
    }
}
