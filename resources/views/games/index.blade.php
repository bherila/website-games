@extends('layouts.game')

@section('title', 'Games | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div id="game-select-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/games/game-select/index.tsx'])
@endpush
