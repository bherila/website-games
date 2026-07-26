@extends('layouts.game')

@section('title', 'Block Blaster')

@section('content')
  <div id="block-blaster-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/block-blaster/index.tsx')
@endpush
