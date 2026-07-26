@extends('layouts.game')

@section('title', 'Math Horde')

@section('content')
  <div id="math-horde-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/math-horde/index.tsx')
@endpush
