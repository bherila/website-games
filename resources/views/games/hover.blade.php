@extends('layouts.game')

@section('title', 'Hover')

@section('content')
  <div id="hover-game-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/hover/index.tsx')
@endpush
