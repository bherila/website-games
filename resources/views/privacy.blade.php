@extends('layouts.game')

@section('title', 'Privacy | ' . config('app.name', 'Games'))

@section('content')
<div class="mx-auto max-w-2xl px-4 py-12 text-foreground">
    <a href="{{ route('games.index') }}" class="mb-4 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">← All games</a>
    <h1 class="text-3xl font-bold">Privacy</h1>
    <p class="mt-1 text-sm text-muted-foreground">Last updated October 25, 2026</p>

    <div class="mt-8 flex flex-col gap-8 text-sm leading-relaxed">
        <section>
            <h2 class="text-lg font-semibold">Playing without an account</h2>
            <p class="mt-2">You can play every game without signing in. Your progress and settings (such as sound and board orientation) are then kept only in this browser's local storage. They never reach our server, and clearing your browser data removes them.</p>
        </section>

        <section>
            <h2 class="text-lg font-semibold">What we keep when you sign in</h2>
            <p class="mt-2">Signing in syncs your progress between devices. For that we store:</p>
            <ul class="mt-2 list-disc pl-5">
                <li>Your name and email address, from the service you sign in with, and changes you make on your Account page.</li>
                <li>The account identifier that service gives us (never your password; we do not receive it).</li>
                <li>Your game progress and saves, and practice history in games that track it.</li>
                <li>A record of changes to your account, such as email confirmations and newly linked sign-in methods.</li>
                <li>Ordinary server logs (IP address, browser, pages requested and times), used to keep the site running and secure.</li>
            </ul>
        </section>

        <section>
            <h2 class="text-lg font-semibold">Cookies and browser storage</h2>
            <p class="mt-2">We use a session cookie and a security token to keep you signed in and protect forms, and a remember-me cookie so you stay signed in for up to a year. A theme cookie remembers light or dark mode. Local storage keeps game progress and settings, and your browser keeps an offline copy of the games so they load without a connection. Pages showing your account are never stored offline. There are no advertising or analytics trackers.</p>
        </section>

        <section>
            <h2 class="text-lg font-semibold">Services that help run the site</h2>
            <ul class="mt-2 list-disc pl-5">
                <li><strong>Google</strong>, only if you choose "Continue with Google": Google confirms who you are and shares your name, email address and Google account identifier with us.</li>
                <li><strong>bherila ID</strong>, the sign-in service for existing accounts.</li>
                <li><strong>Brevo</strong> sends account emails, such as email confirmation links, so it receives your address and the message.</li>
                <li>Our hosting provider stores the site and its database.</li>
            </ul>
            <p class="mt-2">We do not sell your information or use it for advertising.</p>
        </section>

        <section>
            <h2 class="text-lg font-semibold">Keeping and deleting your data</h2>
            <p class="mt-2">We keep your account and progress until you delete them. You can delete your account at any time from the Account page: this removes the account, its synced progress and saves, and its sign-in links. A record that an account was deleted is kept, without your name or email. Progress kept only in your browser is not affected; clear it from your browser settings.</p>
        </section>

        <section>
            <h2 class="text-lg font-semibold">Children</h2>
            <p class="mt-2">Anyone can play without an account. Accounts are not intended for children under 13, and we do not knowingly collect personal information from them.</p>
        </section>

        @if (filled(config('app.privacy_contact')))
            <section>
                <h2 class="text-lg font-semibold">Questions and requests</h2>
                <p class="mt-2">To ask about your data or make a privacy request, email <a href="mailto:{{ config('app.privacy_contact') }}" class="font-medium text-primary underline-offset-2 hover:underline">{{ config('app.privacy_contact') }}</a>.</p>
            </section>
        @endif
    </div>
</div>
@endsection
