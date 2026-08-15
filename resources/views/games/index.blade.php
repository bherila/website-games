@extends('layouts.game')

@section('title', 'Games | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
        <a href="https://bherila.net" class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            bherila.net
        </a>
        <div class="flex items-center gap-4">
            @guest
                <a href="{{ route('oauth.redirect') }}" class="font-medium text-primary hover:underline">
                    Sign in to sync progress
                </a>
            @endguest
            <button
                type="button"
                id="theme-toggle"
                class="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                <svg data-theme-icon="system" xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                <svg data-theme-icon="light" hidden xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                <svg data-theme-icon="dark" hidden xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </button>
            <script>
              (function () {
                var btn = document.getElementById('theme-toggle');
                if (!btn || !window.bwhTheme) return;
                var order = ['system', 'light', 'dark'];
                var current = window.bwhTheme.read();
                if (order.indexOf(current) === -1) current = 'system';
                var render = function () {
                  btn.setAttribute('aria-label', 'Theme: ' + current + ' (activate to change)');
                  btn.title = 'Theme: ' + current;
                  btn.querySelectorAll('[data-theme-icon]').forEach(function (icon) {
                    icon.hidden = icon.getAttribute('data-theme-icon') !== current;
                  });
                };
                btn.addEventListener('click', function () {
                  current = order[(order.indexOf(current) + 1) % order.length];
                  window.bwhTheme.save(current);
                  window.bwhTheme.apply(current);
                  render();
                });
                render();
              })();
            </script>
        </div>
    </div>
    <div id="game-select-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/games/game-select/index.tsx'])
@endpush
