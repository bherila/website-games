<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OAuthLoginController extends Controller
{
    private const string STATE_SESSION_KEY = 'oauth.login.state';

    private const string VERIFIER_SESSION_KEY = 'oauth.login.code_verifier';

    public function redirect(Request $request): RedirectResponse
    {
        $providerUrl = $this->configuredValue('base_url');
        $state = Str::random(40);
        $verifier = Str::random(96);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $request->session()->put([
            self::STATE_SESSION_KEY => $state,
            self::VERIFIER_SESSION_KEY => $verifier,
        ]);

        return redirect()->away($providerUrl.'/oauth/authorize?'.http_build_query([
            'client_id' => $this->configuredValue('client_id'),
            'redirect_uri' => $this->configuredValue('redirect_uri'),
            'response_type' => 'code',
            'scope' => 'identity:read',
            'state' => $state,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));
    }

    public function callback(Request $request): RedirectResponse
    {
        $expectedState = $request->session()->pull(self::STATE_SESSION_KEY);
        $verifier = $request->session()->pull(self::VERIFIER_SESSION_KEY);
        $state = $request->query('state');
        $code = $request->query('code');

        abort_unless(
            is_string($expectedState)
            && is_string($state)
            && hash_equals($expectedState, $state)
            && is_string($verifier)
            && is_string($code)
            && $code !== '',
            403,
            'The OAuth response could not be verified.',
        );

        $providerUrl = $this->configuredValue('base_url');
        $tokenResponse = Http::asForm()->acceptJson()->post($providerUrl.'/oauth/token', [
            'grant_type' => 'authorization_code',
            'client_id' => $this->configuredValue('client_id'),
            'client_secret' => $this->configuredValue('client_secret'),
            'redirect_uri' => $this->configuredValue('redirect_uri'),
            'code' => $code,
            'code_verifier' => $verifier,
        ]);
        abort_unless($tokenResponse->successful(), 502, 'The identity provider rejected the authorization code.');

        $accessToken = $tokenResponse->json('access_token');
        abort_unless(is_string($accessToken) && $accessToken !== '', 502, 'The identity provider returned an invalid token.');

        $identityResponse = Http::acceptJson()
            ->withToken($accessToken)
            ->get($providerUrl.'/api/oauth/user');
        abort_unless($identityResponse->successful(), 502, 'The identity provider did not return an account.');

        $identity = $identityResponse->json();
        abort_unless(
            is_array($identity)
            && is_string($identity['sub'] ?? null)
            && $identity['sub'] !== ''
            && strlen($identity['sub']) <= 191
            && is_string($identity['name'] ?? null)
            && $identity['name'] !== ''
            && is_string($identity['email'] ?? null)
            && filter_var($identity['email'], FILTER_VALIDATE_EMAIL) !== false,
            502,
            'The identity provider returned an invalid account.',
        );

        $user = $this->resolveUser(
            provider: $this->configuredValue('name'),
            subject: $identity['sub'],
            name: $identity['name'],
            email: $identity['email'],
        );

        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    private function resolveUser(string $provider, string $subject, string $name, string $email): User
    {
        try {
            return DB::transaction(function () use ($provider, $subject, $name, $email): User {
                $user = User::query()
                    ->where('oauth_provider', $provider)
                    ->where('oauth_subject', $subject)
                    ->lockForUpdate()
                    ->first();

                if ($user === null) {
                    return User::query()->forceCreate([
                        'name' => $name,
                        'email' => $email,
                        // The provider does not return an email_verified claim.
                        'email_verified_at' => null,
                        'password' => Hash::make(Str::random(64)),
                        'oauth_provider' => $provider,
                        'oauth_subject' => $subject,
                    ]);
                }

                $emailChanged = strcasecmp($user->email, $email) !== 0;
                $user->forceFill([
                    'name' => $name,
                    'email' => $email,
                    // Preserve independent verification only while the address is
                    // unchanged; the provider does not verify a replacement address.
                    'email_verified_at' => $emailChanged ? null : $user->email_verified_at,
                ])->save();

                return $user;
            });
        } catch (QueryException $exception) {
            if (! in_array($exception->errorInfo[0] ?? null, ['23000', '23505'], true)) {
                throw $exception;
            }

            $user = User::query()
                ->where('oauth_provider', $provider)
                ->where('oauth_subject', $subject)
                ->first();

            /**
             * A concurrent sign-in for the same subject won the insert. Its row is the
             * canonical one, so adopt it — but only once it carries the profile this
             * request just asserted, otherwise the two requests disagree about the
             * account and neither should silently win.
             */
            if ($user !== null && $user->name === $name && strcasecmp($user->email, $email) === 0) {
                return $user;
            }

            throw $this->unprovisionableIdentity($provider, $email, $user);
        }
    }

    /**
     * Refuse the sign-in and leave a redacted trail explaining which conflict caused it.
     *
     * Two unrelated unique constraints reach this point and they need very different
     * responses from an operator: the composite provider-identity index (a genuine
     * subject conflict) and the plain email index (a local account that predates the
     * provider link and has no subject bound yet — the shape produced by copying rows
     * across from the provider's database without carrying the subject over).
     *
     * Neither is recoverable in code. Binding the unlinked row on the strength of a
     * matching email is exactly the takeover this app's identity model exists to
     * prevent, and the provider does not assert `email_verified`, so there is nothing
     * to raise that match above an unverified claim. The link is an operator decision,
     * made out of band with `oauth:bind-subject`.
     *
     * The response stays generic in both branches so it cannot be used to probe which
     * addresses have accounts here; the detail goes to the log, where the operator is.
     * Nothing user-identifying is logged — row ids only, never the address or subject.
     */
    private function unprovisionableIdentity(string $provider, string $email, ?User $subjectUser): ConflictHttpException
    {
        $emailHolder = User::query()
            ->whereRaw('lower(email) = ?', [Str::lower($email)])
            ->first();

        Log::warning('OAuth sign-in could not be provisioned.', [
            'provider' => $provider,
            'subject_bound_to' => $subjectUser === null ? null : 'users#'.$subjectUser->getKey(),
            'email_held_by' => $emailHolder === null ? null : 'users#'.$emailHolder->getKey(),
            'email_holder_is_linked' => $emailHolder?->oauth_subject !== null,
            'reason' => $subjectUser === null && $emailHolder !== null && $emailHolder->oauth_subject === null
                ? 'A local account holds this address but has no provider subject bound. Link it with oauth:bind-subject.'
                : 'The asserted profile conflicts with an account already bound to another identity.',
        ]);

        return new ConflictHttpException('This account could not be linked to the identity provider.');
    }

    private function configuredValue(string $key): string
    {
        $value = config("services.identity_provider.{$key}");

        abort_unless(is_string($value) && $value !== '', 503, 'OAuth is not configured.');
        if ($key === 'name') {
            abort_unless(
                $value === trim($value)
                && Str::length($value) <= 64
                && strlen($value) <= 256,
                503,
                'OAuth is not configured.',
            );
        }

        return rtrim($value, $key === 'base_url' ? '/' : '');
    }
}
