@extends('layouts.game')

@section('title', 'Admin | ' . config('app.name', 'Ben Herila'))

@push('data-head')
    {{-- Links and endpoints only: no credentials, no account details. --}}
    <script id="admin-panel-data" type="application/json">{!! json_encode($panel, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) !!}</script>
@endpush

@section('content')
    <div class="mx-auto max-w-6xl px-4 pt-4">
        <a href="{{ route('games.index') }}" class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            Games
        </a>
    </div>
    <div id="admin-root"></div>
    <noscript><p class="mx-auto max-w-6xl px-4 py-6">The admin panel needs JavaScript.</p></noscript>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/admin/index.tsx'])
@endpush
