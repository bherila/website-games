@extends('layouts.game')

@section('title', 'Games | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
        <a href="https://bherila.net" class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            bherila.net
        </a>
        @guest
            <a href="{{ route('oauth.redirect') }}" class="font-medium text-primary hover:underline">
                Sign in to sync progress
            </a>
        @endguest
    </div>
    <div id="game-select-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/games/game-select/index.tsx'])
@endpush
