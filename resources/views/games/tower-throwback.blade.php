@extends('layouts.game')

@section('title', 'Tower Throwback')

@section('content')
  <div id="tower-game-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/tower-throwback/index.tsx')
@endpush
