@extends('layouts.game')

@section('title', 'Marble Sort')

{{-- The shared bottom toolbar pads itself with env(safe-area-inset-bottom), so the
     playfield can safely extend under a notch / home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="marble-sort-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/marble-sort/index.tsx')
@endpush
