@extends('layouts.game')

@section('title', 'Sign In | ' . config('app.name', 'Games'))

@section('content')
<div class="mx-auto max-w-md px-4 py-12">
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-900">
        <h1 class="mb-2 text-2xl font-bold">Sign In</h1>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Sign in to sync game progress between devices.
        </p>
        <a
            href="{{ route('oauth.redirect') }}"
            class="block w-full rounded-md bg-blue-600 px-4 py-2 text-center font-medium text-white hover:bg-blue-700"
        >
            Sign in
        </a>
    </div>
</div>
@endsection
