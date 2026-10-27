@extends('layouts.game')

@section('title', 'Tower 2 (prototype)')
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

{{-- Unlisted while it is a prototype: reachable by link only, and kept out of search. --}}
@push('data-head')
  <meta name="robots" content="noindex, nofollow">
@endpush

@section('content')
  <div id="tower-2-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/tower-2/index.tsx')
@endpush
