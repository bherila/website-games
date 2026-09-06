@extends('layouts.game')

@section('title', 'Mandarin Quest: Find Your Friend')
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="mandarin-game-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/mandarin/index.tsx')
@endpush
