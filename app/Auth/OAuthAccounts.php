<?php

namespace App\Auth;

use BWH\Auth\OAuth\Login\RelyingPartyAccounts;
use BWH\Auth\OAuth\OAuthIdentity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class OAuthAccounts extends RelyingPartyAccounts
{
    public function newAccountAttributes(OAuthIdentity $identity): array
    {
        return [
            'name' => $identity->name,
            'email' => $identity->email,
            // The provider does not return an email_verified claim.
            'email_verified_at' => null,
            'password' => Hash::make(Str::random(64)),
        ];
    }

    /**
     * An address confirmed on the account page belongs to this application and is kept (see
     * App\Services\Account\AccountEmail). Until then the provider's address is used, which is
     * also how a delegated-access placeholder gets filled in.
     */
    public function refreshedAttributes(Model $account, OAuthIdentity $identity): array
    {
        return $account->getAttribute('email_verified_at') === null
            ? ['name' => $identity->name, 'email' => $identity->email]
            : ['name' => $identity->name];
    }

    public function assertsSameProfile(Model $account, OAuthIdentity $identity): bool
    {
        return $account->getAttribute('name') === $identity->name
            && ($account->getAttribute('email_verified_at') !== null
                || strcasecmp((string) $account->getAttribute('email'), $identity->email) === 0);
    }
}
