<?php

namespace App\Http\Controllers\Account;

use App\Http\Controllers\Controller;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Services\Account\AccountEmail;
use App\Services\Account\EmailConfirmationFailed;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class AccountController extends Controller
{
    public function show(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        return view('account', [
            'user' => $user,
            'pending' => EmailChangeRequest::query()->where('user_id', $user->getKey())->where('expires_at', '>', now())->first(),
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

    public function confirmEmail(Request $request, AccountEmail $emails, string $token): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        try {
            $emails->confirm($user, $token);
        } catch (EmailConfirmationFailed $failure) {
            return redirect()->route('account.show')->with('error', $failure->getMessage());
        }

        return redirect()->route('account.show')->with('status', 'Your email is confirmed.');
    }
}
