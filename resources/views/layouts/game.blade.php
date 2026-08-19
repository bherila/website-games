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
    {{-- Games JS only reads `authenticated` and `currentUser.id` (see
         resources/js/games/_shared/gameDataPersistence.ts). --}}
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
    {{-- Theme preference is shared across *.bherila.net (root included) via a
         `theme` cookie (values: system|light|dark) on Domain=.bherila.net.
         localStorage mirrors it so local dev works where that cookie can't be
         set. window.bwhTheme is consumed by the homepage toggle
         (games/index.blade.php); sibling sites read the same cookie. --}}
    <script>
      (function() {
        try {
          var d = document.documentElement;
          var media = window.matchMedia('(prefers-color-scheme: dark)');
          var read = function () {
            var m = document.cookie.match(/(?:^|;\s*)theme=(dark|light|system)(?:;|$)/);
            return (m && m[1]) || localStorage.getItem('theme') || 'system';
          };
          var apply = function (theme) {
            var isDark = theme === 'dark' || (theme === 'system' && media.matches);
            d.classList.toggle('dark', isDark);
            d.style.colorScheme = isDark ? 'dark' : 'light';
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', isDark ? '#0a1220' : '#f2f6fc');
          };
          var save = function (theme) {
            try { localStorage.setItem('theme', theme); } catch (e) { /* no-op */ }
            var host = location.hostname;
            if (host === 'bherila.net' || host.endsWith('.bherila.net')) {
              document.cookie = 'theme=' + theme + '; domain=.bherila.net; path=/; max-age=31536000; samesite=lax'
                + (location.protocol === 'https:' ? '; secure' : '');
            }
          };
          window.bwhTheme = { read: read, apply: apply, save: save };
          apply(read());
          media.addEventListener('change', function () { apply(read()); });
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
