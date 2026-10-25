@extends('layouts.game')

@section('title', 'Account | ' . config('app.name', 'Games'))

@section('content')
<div class="mx-auto max-w-md px-4 py-12">
    <a href="{{ route('games.index') }}" class="mb-4 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">← All games</a>
    <div class="rounded-lg border border-border bg-card p-6 shadow-md">
        <h1 class="mb-1 text-2xl font-bold text-card-foreground">Account</h1>
        <p class="mb-6 text-sm text-muted-foreground">{{ $user->name }}</p>

        @if (session('status'))
            <p role="status" class="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{{ session('status') }}</p>
        @endif
        @if (session('error'))
            <p role="alert" class="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{{ session('error') }}</p>
        @endif

        @if ($mergeOffer && $mergeHolder)
            <section class="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50" data-testid="merge-offer">
                <h2 class="font-semibold">Merge your other account?</h2>
                <p class="mt-1">{{ $mergeOffer->email }} belongs to another Games account ({{ $mergeHolder->name }}, {{ $mergeHolder->gameData()->count() }} saved game {{ \Illuminate\Support\Str::plural('record', $mergeHolder->gameData()->count()) }}). Merging moves its sign-in methods and progress into this account, keeping the best result for each level, then deletes it. This account then uses {{ $mergeOffer->email }}.</p>
                <div class="mt-3 flex gap-2">
                    <form method="POST" action="{{ route('account.merge') }}">
                        @csrf
                        <button type="submit" class="rounded-md bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800">Merge accounts</button>
                    </form>
                    <form method="POST" action="{{ route('account.merge.cancel') }}">
                        @csrf
                        @method('DELETE')
                        <button type="submit" class="rounded-md border border-amber-400 px-4 py-2 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">Not now</button>
                    </form>
                </div>
            </section>
        @endif

        <h2 class="text-sm font-semibold text-card-foreground">Sign-in methods</h2>
        <ul class="mb-6 mt-1 text-sm text-card-foreground" data-testid="sign-in-methods">
            @if ($user->oauth_subject !== null)
                <li>bherila ID</li>
            @endif
            @foreach ($user->identities as $identity)
                <li>{{ $identity->provider === \App\Models\UserIdentity::GOOGLE ? 'Google' : $identity->provider }}@if ($identity->email) <span class="text-muted-foreground">({{ $identity->email }})</span>@endif</li>
            @endforeach
        </ul>

        <h2 class="text-sm font-semibold text-card-foreground">Email</h2>
        <p class="mt-1 text-sm text-card-foreground" data-testid="account-email">
            {{ $user->email }}
            @if ($user->email_verified_at)
                <span class="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Confirmed</span>
            @else
                <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">Not confirmed</span>
            @endif
        </p>

        @unless ($user->email_verified_at)
            <form method="POST" action="{{ route('account.email.request') }}" class="mt-3">
                @csrf
                <input type="hidden" name="email" value="{{ $user->email }}">
                <p class="mb-2 text-xs text-muted-foreground">Confirm your email to also sign in to this account with a Google account that uses it.</p>
                <button type="submit" class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/85">Send confirmation email</button>
            </form>
        @endunless

        @if ($pending)
            <p class="mt-4 text-xs text-muted-foreground" data-testid="pending-email">Waiting for confirmation of {{ $pending->email }}.</p>
        @endif

        <form method="POST" action="{{ route('account.email.request') }}" class="mt-6 border-t border-border pt-4">
            @csrf
            <label for="new-email" class="text-sm font-semibold text-card-foreground">Change email</label>
            <input id="new-email" name="email" type="email" required autocomplete="email" value="{{ old('email') }}"
                class="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
            @error('email')
                <p role="alert" class="mt-1 text-xs text-rose-700 dark:text-rose-300">{{ $message }}</p>
            @enderror
            <p class="mt-2 text-xs text-muted-foreground">We will email a link to the new address. Your email changes only when you open it while signed in.</p>
            <button type="submit" class="mt-3 rounded-md border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted">Send link</button>
        </form>

        <form method="POST" action="{{ route('account.destroy') }}" class="mt-6 border-t border-border pt-4">
            @csrf
            @method('DELETE')
            <h2 class="text-sm font-semibold text-card-foreground">Delete account</h2>
            @if ($user->isAdministrator())
                <p class="mt-1 text-xs text-muted-foreground">Administrators cannot delete their own account. Remove the administrator role first.</p>
            @else
                <p class="mt-1 text-xs text-muted-foreground">Deletes this account, its synced progress and saves, and its sign-in links. Progress saved only in this browser is not affected. This cannot be undone.</p>
                <label for="delete-confirmation" class="mt-3 block text-xs font-medium text-card-foreground">Type DELETE to confirm</label>
                <input id="delete-confirmation" name="confirmation" type="text" autocomplete="off" required
                    class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                @error('confirmation')
                    <p role="alert" class="mt-1 text-xs text-rose-700 dark:text-rose-300">{{ $message }}</p>
                @enderror
                <button type="submit" class="mt-3 rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800">Delete account</button>
            @endif
        </form>
    </div>
    <p class="mt-4 text-center text-xs text-muted-foreground"><a href="{{ route('privacy') }}" class="hover:text-foreground">Privacy</a></p>
</div>
@endsection
