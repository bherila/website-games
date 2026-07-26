@extends('layouts.game')

@section('title', 'Games | ' . config('app.name', 'Ben Herila'))

@section('content')
    @guest
        <div class="mx-auto flex max-w-5xl justify-end px-4 pt-4">
            <a href="{{ route('oauth.redirect') }}" class="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Sign in to sync progress
            </a>
        </div>
    @endguest
    <div id="game-select-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/games/game-select/index.tsx'])
@endpush
