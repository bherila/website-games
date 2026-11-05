<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Account\SignInMethod;
use BWH\Auth\Http\Controllers\RelyingPartyLoginController;
use BWH\Auth\OAuth\OAuthIdentity;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/**
 * Sign-in and sign-out through the identity provider. The shared controller does the work;
 * the account rules are in App\Auth\OAuthAccounts.
 */
class OAuthLoginController extends RelyingPartyLoginController
{
    protected bool $remember = true;

    protected function afterSignIn(Request $request, Authenticatable $account, OAuthIdentity $identity): void
    {
        SignInMethod::remember($request->session(), SignInMethod::IDENTITY_PROVIDER);
    }

    /**
     * A Google session never involved the identity provider, so it ends here. A session
     * restored from the remember-me cookie records no method; an account with no identity
     * provider binding can only have signed in with Google, so it ends here too.
     */
    protected function signsOutLocallyOnly(Request $request, ?Authenticatable $user): bool
    {
        $method = SignInMethod::current($request->session());

        return $method === SignInMethod::GOOGLE
            || ($method === null && $user instanceof User && $user->oauth_subject === null);
    }
}
