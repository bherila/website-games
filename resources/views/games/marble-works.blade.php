@extends('layouts.game')

@section('title', 'Marble Works')

{{-- The shared bottom toolbar pads itself with env(safe-area-inset-bottom), so the
     playfield can safely extend under a notch / home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="marble-works-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/marble-works/index.tsx')
@endpush
