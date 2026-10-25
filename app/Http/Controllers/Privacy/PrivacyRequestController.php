<?php

namespace App\Http\Controllers\Privacy;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Privacy\PrivacyRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PrivacyRequestController extends Controller
{
    public function store(Request $request, PrivacyRequests $requests): RedirectResponse
    {
        abort_unless(PrivacyRequests::enabled(), 404);
        $back = $request->input('return') === 'accessibility' ? route('accessibility') : route('privacy');

        $validated = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'topic' => ['required', Rule::in(array_keys(PrivacyRequests::TOPICS))],
            'message' => ['nullable', 'string', 'max:5000'],
        ], [], ['email' => 'email address', 'topic' => 'request type']);

        // A hidden field people never see; anything in it is a bot. Answer as if it worked.
        if (filled($request->input('website'))) {
            return redirect()->to($back.'#request')->with('privacy_request_sent', true);
        }

        $user = $request->user();
        $requests->submit($validated['email'], $validated['topic'], (string) ($validated['message'] ?? ''), $user instanceof User ? $user : null);

        return redirect()->to($back.'#request')->with('privacy_request_sent', true);
    }
}
