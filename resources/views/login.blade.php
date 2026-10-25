@extends('layouts.game')

@section('title', 'Sign In | ' . config('app.name', 'Games'))

@section('content')
<div class="mx-auto max-w-md px-4 py-12">
    <div class="rounded-lg border border-border bg-card p-6 shadow-md">
        <h1 class="mb-2 text-2xl font-bold text-card-foreground">Sign In</h1>
        <p class="mb-6 text-sm text-muted-foreground">
            Sign in to sync game progress between devices.
        </p>
        @if (session('error'))
            <p role="alert" class="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{{ session('error') }}</p>
        @endif
        <div class="flex flex-col gap-3">
            @if (\App\Http\Controllers\GoogleLoginController::enabled())
                <a
                    href="{{ route('oauth.google.redirect') }}"
                    class="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-center font-medium text-foreground hover:bg-muted hover:no-underline"
                    data-testid="google-sign-in"
                >
                    <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
                    Continue with Google
                </a>
            @endif
            <a
                href="{{ route('oauth.redirect') }}"
                class="block w-full rounded-md bg-primary px-4 py-2 text-center font-medium text-primary-foreground hover:bg-primary/85 hover:no-underline"
            >
                Sign in with bherila ID
            </a>
        </div>
        <p class="mt-6 text-center text-xs text-muted-foreground">
            Playing without an account keeps progress in this browser only.
        </p>
    </div>
    <div class="mt-4">@include('partials.legal-links')</div>
</div>
@endsection
