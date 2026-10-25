@extends('layouts.game')

@section('title', 'Accessibility | ' . config('app.name', 'Games'))

@section('content')
<article class="mx-auto max-w-2xl px-4 py-12 text-foreground" aria-labelledby="accessibility-title">
    <a href="{{ route('games.index') }}" class="mb-4 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">← All games</a>
    <h1 id="accessibility-title" class="text-3xl font-bold">Accessibility</h1>
    <p class="mt-1 text-sm text-muted-foreground">Last reviewed October 25, 2026</p>

    <div class="mt-8 flex flex-col gap-8 text-sm leading-relaxed">
        <section aria-labelledby="commitment">
            <h2 id="commitment" class="text-lg font-semibold">Our commitment</h2>
            <p class="mt-2">We want everyone to be able to use BWH Games, including people who use a keyboard instead of a mouse, a screen reader, magnification or other assistive technology. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA, the standard used for the Americans with Disabilities Act and similar laws.</p>
        </section>

        <section aria-labelledby="done">
            <h2 id="done" class="text-lg font-semibold">What we do</h2>
            <ul class="mt-2 list-disc pl-5">
                <li>The home, sign-in, account, privacy and accessibility pages work with a keyboard, show a visible focus indicator, and are checked automatically against WCAG 2.1 AA rules on every change.</li>
                <li>Controls and game pieces you can act on have text labels for screen readers, and game status changes are announced where the game supports it.</li>
                <li>Light and dark themes follow your system setting, and many games tone down animation when your system asks for reduced motion.</li>
                <li>Puzzle games have no time limit, and most let you undo or retry; only the action games depend on speed.</li>
                <li>Several games offer alternatives such as a colorblind mode, sound effects you can mute, and on-screen buttons as well as gestures.</li>
            </ul>
        </section>

        <section aria-labelledby="limitations">
            <h2 id="limitations" class="text-lg font-semibold">Known limitations</h2>
            <p class="mt-2">Some games are inherently visual or real-time: action games such as Hover and Math Horde need quick visual reactions, and the 3D puzzle games are hard to play without sight. Their menus, settings and account pages remain accessible, and we keep improving the games themselves. If something gets in your way, please tell us below so we can fix it or help another way.</p>
        </section>

        <section aria-labelledby="feedback-intro">
            <h2 id="feedback-intro" class="text-lg font-semibold">Feedback</h2>
            <p class="mt-2">Tell us about any barrier you meet, what you were trying to do, and the device or assistive technology you use. We reply within {{ \App\Services\Privacy\PrivacyRequests::RESPONSE_DAYS }} days, usually much sooner.</p>
        </section>

        @include('partials.privacy-request-form', ['heading' => 'Report an accessibility problem', 'return' => 'accessibility', 'topic' => 'accessibility'])
    </div>

    <div class="mt-10">@include('partials.legal-links')</div>
</article>
@endsection
