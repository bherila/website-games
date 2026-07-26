@extends('layouts.game')

@section('title', "Chick's Challenge")

{{-- The HUD, toolbar and D-pad pad themselves with env(safe-area-inset-*), so the
     playfield can safely extend under a notch / home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="chicks-game-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/chicks-challenge/index.tsx')
@endpush
