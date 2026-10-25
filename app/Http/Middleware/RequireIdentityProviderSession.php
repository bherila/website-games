<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Account\SignInMethod;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sends an administrator whose session was not signed in through the identity provider (a
 * Google sign-in, or a session restored from the remember-me cookie) back through it, so the
 * `administer` gate can then pass. Everyone else continues to the gate as before.
 */
class RequireIdentityProviderSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user instanceof User && $user->isAdministrator() && ! SignInMethod::viaIdentityProvider($request->session())) {
            abort_if($request->expectsJson(), 403, 'Sign in with bherila ID to administer.');

            return redirect()->guest(route('oauth.redirect'));
        }

        return $next($request);
    }
}
