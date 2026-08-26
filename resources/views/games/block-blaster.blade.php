@extends('layouts.game')

@section('title', 'Block Blaster')

{{-- The shared bottom toolbar pads itself with env(safe-area-inset-bottom), so the
     playfield can safely extend under a notch / home indicator. --}}
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="block-blaster-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/block-blaster/index.tsx')
@endpush
