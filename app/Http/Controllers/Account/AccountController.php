<?php

namespace App\Http\Controllers\Account;

use App\Http\Controllers\Controller;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Services\Account\AccountDeletion;
use App\Services\Account\AccountEmail;
use App\Services\Account\AccountMerge;
use App\Services\Account\AccountMergeRefused;
use App\Services\Account\EmailConfirmationFailed;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class AccountController extends Controller
{
    /** A merge offer lasts this long after its confirmation link is opened. */
    private const MERGE_OFFER_MINUTES = 15;

    private const MERGE_OFFER = 'account.merge_offer';

    public function show(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        $offer = $this->mergeOffer($request, $user);

        return view('account', [
            'user' => $user,
            'pending' => EmailChangeRequest::query()->where('user_id', $user->getKey())->where('expires_at', '>', now())->first(),
            'mergeOffer' => $offer,
            'mergeHolder' => $offer !== null ? AccountEmail::holder($user, $offer->email) : null,
        ]);
    }

    /**
     * Sends a confirmation link to a new address, or to the current one to verify it. Whether
     * another account holds the address is only revealed after the link is followed, so this
     * form cannot be used to discover which addresses have accounts.
     */
    public function requestEmail(Request $request, AccountEmail $emails): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validate(['email' => ['required', 'string', 'email:rfc', 'max:255']]);
        $email = AccountEmail::normalise($validated['email']);

        if ($email === AccountEmail::normalise($user->email) && $user->email_verified_at !== null) {
            return redirect()->route('account.show')->with('status', 'That address is already confirmed.');
        }

        $emails->request($user, $email);

        return redirect()->route('account.show')->with('status', "We sent a confirmation link to {$email}. It works for ".AccountEmail::LINK_MINUTES.' minutes.');
    }

    /**
     * Deletes the signed-in account after the holder types DELETE. Signing in again later
     * starts a new, empty account.
     */
    public function destroy(Request $request, AccountDeletion $deletion): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $request->validate(['confirmation' => ['required', 'string', 'in:DELETE']], [
            'confirmation.in' => 'Type DELETE in capitals to delete your account.',
        ]);
        if ($user->isAdministrator()) {
            return redirect()->route('account.show')->with('error', 'Administrators cannot delete their own account. Remove the administrator role first.');
        }

        // Sign out first: logging out rotates the remember-me token by saving the user, which
        // would re-insert an already deleted row.
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $deletion->delete($user);

        return redirect()->route('games.index')->with('status', 'Your account and its saved progress were deleted.');
    }

    public function confirmEmail(Request $request, AccountEmail $emails, string $token): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        try {
            $mergeable = $emails->confirm($user, $token);
        } catch (EmailConfirmationFailed $failure) {
            return redirect()->route('account.show')->with('error', $failure->getMessage());
        }

        if ($mergeable !== null) {
            $request->session()->put(self::MERGE_OFFER, ['request' => $mergeable->getKey(), 'user' => $user->getKey(), 'expires' => now()->addMinutes(self::MERGE_OFFER_MINUTES)->getTimestamp()]);

            return redirect()->route('account.show');
        }

        return redirect()->route('account.show')->with('status', 'Your email is confirmed.');
    }

    /**
     * Accepts the merge offered when this account's confirmation link was opened for an address
     * another confirmed account holds. Only valid in the session where that link was opened.
     */
    public function merge(Request $request, AccountEmail $emails, AccountMerge $merge): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $offer = $this->mergeOffer($request, $user);
        $request->session()->forget(self::MERGE_OFFER);
        if ($offer === null) {
            return redirect()->route('account.show')->with('error', 'That merge offer has expired. Request a new confirmation link.');
        }

        try {
            $emails->completeWithMerge($user, $offer->getKey(), $merge);
        } catch (EmailConfirmationFailed|AccountMergeRefused $failure) {
            return redirect()->route('account.show')->with('error', $failure->getMessage());
        }

        return redirect()->route('account.show')->with('status', 'The accounts are merged, and your email is confirmed.');
    }

    public function cancelMerge(Request $request): RedirectResponse
    {
        $request->session()->forget(self::MERGE_OFFER);

        return redirect()->route('account.show')->with('status', 'Nothing was merged. Your email is unchanged.');
    }

    private function mergeOffer(Request $request, User $user): ?EmailChangeRequest
    {
        $offer = $request->session()->get(self::MERGE_OFFER);
        if (! is_array($offer) || ($offer['user'] ?? null) !== $user->getKey() || ($offer['expires'] ?? 0) < now()->getTimestamp()) {
            return null;
        }

        return EmailChangeRequest::query()->whereKey($offer['request'] ?? 0)->where('user_id', $user->getKey())->where('expires_at', '>', now())->first();
    }
}
