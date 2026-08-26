<?php

namespace App\Http\Controllers;

use App\Models\User;
use BWH\Auth\Concerns\SignsOutThroughProvider;
use BWH\Auth\OAuth\OAuthClient;
use BWH\Auth\OAuth\ProviderApplications;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OAuthLoginController extends Controller
{
    use SignsOutThroughProvider;

    public function redirect(Request $request, OAuthClient $oauth): RedirectResponse
    {
        return $oauth->redirect($request);
    }

    public function callback(Request $request, OAuthClient $oauth): RedirectResponse
    {
        $identity = $oauth->identityFromCallback($request);

        $user = $this->resolveUser(
            provider: $identity->provider,
            subject: $identity->subject,
            name: $identity->name,
            email: $identity->email,
        );

        Auth::login($user);
        $request->session()->regenerate();

        // Cached for the session rather than fetched per request: this is navigation chrome,
        // and the callback is the only moment an access token for the provider is in hand.
        // Keeping it server-side also keeps the list of the other applications out of the
        // JS bundle, so what exists is not readable by anyone who downloads it.
        ProviderApplications::remember($request, $identity->apps);

        return redirect()->intended('/');
    }

    public function logout(Request $request, OAuthClient $oauth): RedirectResponse
    {
        return $this->signOutThroughProvider($request, $oauth);
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
}
