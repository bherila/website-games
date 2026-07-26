@extends('layouts.game')

@section('title', '2048')

@section('content')
  <div id="game-2048-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/2048/index.tsx')
@endpush
