@extends('layouts.game')

@section('title', 'Sign In | ' . config('app.name', 'Games'))

@section('content')
<div class="mx-auto max-w-md px-4 py-12">
    <div class="rounded-lg border border-border bg-card p-6 shadow-md">
        <h1 class="mb-2 text-2xl font-bold text-card-foreground">Sign In</h1>
        <p class="mb-6 text-sm text-muted-foreground">
            Sign in to sync game progress between devices.
        </p>
        <a
            href="{{ route('oauth.redirect') }}"
            class="block w-full rounded-md bg-primary px-4 py-2 text-center font-medium text-primary-foreground hover:bg-primary/85 hover:no-underline"
        >
            Sign in
        </a>
    </div>
</div>
@endsection
