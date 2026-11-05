@extends('layouts.game')

@section('title', 'Tower Defense')

{{-- The HUD, the build tray and the shared toolbar all pad themselves with
     env(safe-area-inset-*), so the playfield can extend under a notch or home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="tower-defense-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/tower-defense/index.tsx')
@endpush
