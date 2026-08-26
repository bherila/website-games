@extends('layouts.game')

@section('title', '2048')

{{-- The board and shared bottom toolbar pad themselves with env(safe-area-inset-*),
     so the playfield can safely extend under a notch / home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="game-2048-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/2048/index.tsx')
@endpush
