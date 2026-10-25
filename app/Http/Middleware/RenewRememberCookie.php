<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

class RenewRememberCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $guard = Auth::guard();

        if (! $guard instanceof SessionGuard || ! $guard->check()) {
            return $response;
        }

        $name = $guard->getRecallerName();
        $value = $request->cookie($name);

        // Reuse Laravel's encrypted, revocable credential. Never replace a fresh login
        // cookie or a queued deletion, and never regenerate the session/CSRF token here.
        if (is_string($value) && $value !== '' && ! Cookie::hasQueued($name)) {
            $minutes = (int) config('auth.guards.'.Auth::getDefaultDriver().'.remember');
            Cookie::queue(Cookie::make($name, $value, $minutes));
        }

        return $response;
    }
}
