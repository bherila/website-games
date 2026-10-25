<?php

namespace Tests;

use App\Services\Account\SignInMethod;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Signs in as though through the identity provider, which the `administer` gate requires of
     * the session. Plain actingAs() matches a session restored from the remember-me cookie.
     */
    protected function actingThroughIdentityProvider(Authenticatable $user): static
    {
        return $this->actingAs($user)->withSession([SignInMethod::SESSION_KEY => SignInMethod::IDENTITY_PROVIDER]);
    }
}
