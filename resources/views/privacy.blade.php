@extends('layouts.game')

@section('title', 'Privacy | ' . config('app.name', 'Games'))

@section('content')
<article class="mx-auto max-w-2xl px-4 py-12 text-foreground" aria-labelledby="privacy-title">
    <a href="{{ route('games.index') }}" class="mb-4 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">← All games</a>
    <h1 id="privacy-title" class="text-3xl font-bold">Privacy</h1>
    <p class="mt-1 text-sm text-muted-foreground">Last updated October 25, 2026</p>

    <div class="mt-8 flex flex-col gap-8 text-sm leading-relaxed">
        <section aria-labelledby="anonymous">
            <h2 id="anonymous" class="text-lg font-semibold">Playing without an account</h2>
            <p class="mt-2">You can play every game without signing in. Your progress and settings (such as sound and board orientation) are then kept only in this browser's local storage. They never reach our server, and clearing your browser data removes them.</p>
        </section>

        <section aria-labelledby="collected">
            <h2 id="collected" class="text-lg font-semibold">What we keep when you sign in</h2>
            <p class="mt-2">Signing in syncs your progress between devices. For that we store:</p>
            <ul class="mt-2 list-disc pl-5">
                <li>Your name and email address, from the service you sign in with, and changes you make on your Account page.</li>
                <li>The account identifier that service gives us (never your password; we do not receive it).</li>
                <li>Your game progress and saves, and practice history in games that track it.</li>
                <li>A record of changes to your account, such as email confirmations and newly linked sign-in methods.</li>
                <li>Ordinary server logs (IP address, browser, pages requested and times), used to keep the site running and secure.</li>
            </ul>
        </section>

        <section aria-labelledby="cookies">
            <h2 id="cookies" class="text-lg font-semibold">Cookies and browser storage</h2>
            <p class="mt-2">We use a session cookie and a security token to keep you signed in and protect forms, and a remember-me cookie so you stay signed in for up to a year. A theme cookie remembers light or dark mode. Local storage keeps game progress and settings, and your browser keeps an offline copy of the games so they load without a connection. Pages showing your account are never stored offline. There are no advertising or analytics trackers.</p>
        </section>

        <section aria-labelledby="services">
            <h2 id="services" class="text-lg font-semibold">Services that help run the site</h2>
            <ul class="mt-2 list-disc pl-5">
                <li><strong>Google</strong>, only if you choose "Continue with Google": Google confirms who you are and shares your name, email address and Google account identifier with us.</li>
                <li><strong>bherila ID</strong>, the sign-in service for existing accounts.</li>
                <li><strong>Brevo</strong> sends account emails, such as email confirmation links and replies to requests, so it receives your address and the message.</li>
                <li>Our hosting provider stores the site and its database.</li>
            </ul>
            <p class="mt-2">These providers process information only to provide their service to us. We do not sell your information, share it for cross-context behavioral advertising, or use it for advertising.</p>
        </section>

        <section aria-labelledby="retention">
            <h2 id="retention" class="text-lg font-semibold">Keeping and deleting your data</h2>
            <p class="mt-2">We keep your account and progress until you delete them. You can delete your account at any time from the Account page: this removes the account, its synced progress and saves, and its sign-in links. A record that an account was deleted is kept, without your name or email. Server logs are kept only as long as needed to run and secure the site. Progress kept only in your browser is not affected; clear it from your browser settings.</p>
        </section>

        <section aria-labelledby="california">
            <h2 id="california" class="text-lg font-semibold">Your California privacy rights</h2>
            <p class="mt-2">If you live in California, the California Consumer Privacy Act (as amended by the California Privacy Rights Act) gives you the rights below. We extend them to everyone.</p>

            <h3 class="mt-4 font-semibold">Notice at collection</h3>
            <div class="mt-2 overflow-x-auto">
                <table class="w-full border-collapse text-left">
                    <caption class="sr-only">Categories of personal information we collect, where they come from, why, and how long we keep them</caption>
                    <thead>
                        <tr class="border-b border-border">
                            <th scope="col" class="py-2 pr-3 font-semibold">Category</th>
                            <th scope="col" class="py-2 pr-3 font-semibold">Examples</th>
                            <th scope="col" class="py-2 pr-3 font-semibold">Source</th>
                            <th scope="col" class="py-2 font-semibold">Kept</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="border-b border-border align-top">
                            <th scope="row" class="py-2 pr-3 font-medium">Identifiers</th>
                            <td class="py-2 pr-3">Name, email address, sign-in account identifier, IP address</td>
                            <td class="py-2 pr-3">You, your sign-in service, your browser</td>
                            <td class="py-2">Until you delete your account; IP addresses only in logs</td>
                        </tr>
                        <tr class="border-b border-border align-top">
                            <th scope="row" class="py-2 pr-3 font-medium">Internet activity</th>
                            <td class="py-2 pr-3">Pages requested, browser type, times</td>
                            <td class="py-2 pr-3">Your browser</td>
                            <td class="py-2">As long as needed to run and secure the site</td>
                        </tr>
                        <tr class="align-top">
                            <th scope="row" class="py-2 pr-3 font-medium">Game activity</th>
                            <td class="py-2 pr-3">Progress, scores, saves, practice history</td>
                            <td class="py-2 pr-3">You, while playing signed in</td>
                            <td class="py-2">Until you delete your account</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="mt-2">We use this information only to provide the games and sync your progress, to sign you in, to send account emails you ask for, and to keep the site secure and working. We do not collect sensitive personal information as the law defines it, precise location, payment details or biometric data, and we do not draw inferences or build profiles about you.</p>

            <h3 class="mt-4 font-semibold">Selling and sharing</h3>
            <p class="mt-2">We have not sold or shared personal information in the past 12 months and do not sell or share it, including the information of anyone under 16. We have no "Do Not Sell or Share My Personal Information" link because there is nothing to opt out of. We still accept opt-out requests, and we treat a browser's Global Privacy Control signal as a valid request to opt out.</p>

            <h3 class="mt-4 font-semibold">Your rights</h3>
            <ul class="mt-2 list-disc pl-5">
                <li><strong>Know and access</strong>: what personal information we have about you, where it came from, why we use it and who receives it, and a copy of it.</li>
                <li><strong>Delete</strong>: delete your account from the Account page, or ask us.</li>
                <li><strong>Correct</strong>: change your email on the Account page, or ask us to correct other information.</li>
                <li><strong>Opt out</strong> of selling or sharing, and <strong>limit</strong> the use of sensitive personal information. We do neither, but you may still ask.</li>
                <li><strong>No discrimination</strong>: using these rights never changes the games or service you get.</li>
            </ul>

            <h3 class="mt-4 font-semibold">How we handle requests</h3>
            <p class="mt-2">Use the form below. We confirm receipt and reply within {{ \App\Services\Privacy\PrivacyRequests::RESPONSE_DAYS }} days; if we need longer, we will tell you why and take at most {{ \App\Services\Privacy\PrivacyRequests::RESPONSE_DAYS }} more days. Before acting on a request to access, correct or delete information, we check that it comes from the account holder, usually by asking you to sign in to the account or to reply from its email address. An authorized agent may make a request for you with your signed permission; we may still ask you to confirm your identity with us directly. California's "Shine the Light" law does not apply because we do not share personal information with others for their direct marketing.</p>
        </section>

        <section aria-labelledby="children">
            <h2 id="children" class="text-lg font-semibold">Children</h2>
            <p class="mt-2">Anyone can play without an account. Accounts are not intended for children under 13, and we do not knowingly collect personal information from them. If you believe a child under 13 has created an account, use the form below and we will delete it.</p>
        </section>

        <section aria-labelledby="changes">
            <h2 id="changes" class="text-lg font-semibold">Changes to this policy</h2>
            <p class="mt-2">If we change how we handle personal information, we will update this page and its date before the change takes effect.</p>
        </section>

        @include('partials.privacy-request-form', ['heading' => 'Make a privacy request', 'return' => 'privacy'])
    </div>

    <div class="mt-10">@include('partials.legal-links')</div>
</article>
@endsection
