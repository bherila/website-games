@extends('layouts.game')

@section('title', 'Plate Escape')
@section('viewport-content', 'width=device-width, initial-scale=1, viewport-fit=cover')

@section('content')
  <div id="plate-escape-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/plate-escape/index.tsx')
@endpush
