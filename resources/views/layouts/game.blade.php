<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    @viteReactRefresh
    <meta charset="utf-8">
    {{-- Games that pad with env(safe-area-inset-*) opt into `viewport-fit=cover` by
         overriding the `viewport-content` section; without the opt-in the insets
         resolve to 0 and nothing changes for the other games. --}}
    <meta name="viewport" content="@yield('viewport-content', 'width=device-width, initial-scale=1')">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Games | ' . config('app.name', 'Ben Herila'))</title>
    <meta name="color-scheme" content="dark light">
    {{-- Site ships its own dark theme; tells the Dark Reader extension not to re-filter it. --}}
    <meta name="darkreader-lock">
    @include('games.pwa-head')
    {{-- Trimmed from the monorepo layout: no admin roles, client companies, or
         user_role — those are finance-app concepts. Games JS only reads
         `authenticated` and `currentUser.id` (see resources/js/games/_shared/gameDataPersistence.ts). --}}
    <script id="app-initial-data" type="application/json">
      {!! json_encode([
        'appName' => config('app.name', 'Games'),
        'appUrl' => config('app.url', ''),
        'authenticated' => auth()->check(),
        'currentUser' => auth()->user() ? [
          'id' => auth()->id(),
          'name' => auth()->user()->name,
          'email' => auth()->user()->email,
        ] : null,
      ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
    @stack('data-head')
    <script>
      (function() {
        try {
          var theme = localStorage.getItem('theme') || 'system';
          var d = document.documentElement;
          var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          if (isDark) d.classList.add('dark'); else d.classList.remove('dark');
        } catch (e) { /* no-op */ }
      })();
    </script>
    @vite(['resources/css/app.css'])
    @stack('head')
  </head>
  <body class="game-shell min-h-screen flex flex-col">
    <main class="flex-1">
      @yield('content')
    </main>

    {{-- No footer: game shells are exactly 100vh; anything below pushes the
         canvas past the viewport and clips the playfield. --}}

    @stack('scripts')
  </body>
</html>
