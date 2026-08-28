@extends('layouts.game')

@section('title', 'Games | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
        <a href="https://bherila.net" class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            bherila.net
        </a>
        <div class="flex items-center gap-4">
            @auth
                @php($__apps = \BWH\Auth\OAuth\ProviderApplications::forRequest(request()))
                @if ($__apps !== [])
                    {{-- The sibling applications the identity provider reports for this person
                         at sign-in. Rendered server-side and only when signed in, so which
                         applications exist is not published to anonymous visitors and is not
                         compiled into a bundle anyone can read. A native disclosure, so it
                         needs no script of its own. --}}
                    <details class="relative">
                        <summary class="cursor-pointer list-none text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Apps</summary>
                        <div class="absolute right-0 z-50 mt-2 min-w-44 rounded-lg border border-border bg-card p-1 shadow-lg">
                            @foreach ($__apps as $__app)
                                <a href="{{ $__app['url'] }}" class="block whitespace-nowrap rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground hover:no-underline">{{ $__app['name'] }}</a>
                            @endforeach
                        </div>
                    </details>
                @endif
            @endauth
            <div id="account-auth-action">
                @guest
                    <a href="{{ route('oauth.redirect') }}" class="font-medium text-primary hover:underline">
                        Sign in to sync progress
                    </a>
                @endguest
            </div>
            <script>
              (function () {
                var root = document.getElementById('account-auth-action');
                var dataElement = document.getElementById('app-initial-data');
                if (!root || !dataElement) return;

                var data;
                try { data = JSON.parse(dataElement.textContent || '{}'); } catch (e) { data = {}; }

                if (data.authenticated) {
                  var form = document.createElement('form');
                  form.method = 'POST';
                  form.action = {!! json_encode(route('logout')) !!};

                  var token = document.createElement('input');
                  token.type = 'hidden';
                  token.name = '_token';
                  token.value = document.querySelector('meta[name="csrf-token"]')?.content || '';

                  var button = document.createElement('button');
                  button.type = 'submit';
                  button.className = 'font-medium text-primary hover:underline';
                  button.textContent = 'Sign out';

                  form.append(token, button);
                  root.append(form);
                  return;
                }

                if (root.firstElementChild) return;

                var link = document.createElement('a');
                link.href = {!! json_encode(route('oauth.redirect')) !!};
                link.className = 'font-medium text-primary hover:underline';
                link.textContent = 'Sign in to sync progress';
                root.append(link);
              })();
            </script>
            @php($theme = in_array($cookieTheme = request()->cookie('theme'), ['light', 'dark'], true) ? $cookieTheme : 'system')
            {{-- Segmented control from real radios: native arrow-key navigation and
                 checked-state announcements, no hover needed to read the state. --}}
            <fieldset id="theme-switcher" class="inline-flex items-center rounded-full border border-border bg-muted/40 p-1">
                <legend class="sr-only">Color theme</legend>
                <label class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
                    <input type="radio" name="theme" value="system" class="sr-only" @checked($theme === 'system')>
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                    <span class="hidden sm:inline">System<span data-system-resolved></span></span>
                    <span class="sr-only sm:hidden">System</span>
                </label>
                <label class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
                    <input type="radio" name="theme" value="light" class="sr-only" @checked($theme === 'light')>
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                    <span class="hidden sm:inline">Light</span>
                    <span class="sr-only sm:hidden">Light</span>
                </label>
                <label class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
                    <input type="radio" name="theme" value="dark" class="sr-only" @checked($theme === 'dark')>
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                    <span class="hidden sm:inline">Dark</span>
                    <span class="sr-only sm:hidden">Dark</span>
                </label>
            </fieldset>
            <span class="sr-only" role="status" data-theme-announce></span>
            <script>
              (function () {
                var fieldset = document.getElementById('theme-switcher');
                if (!fieldset || !window.bwhTheme) return;
                var media = window.matchMedia('(prefers-color-scheme: dark)');
                var announce = document.querySelector('[data-theme-announce]');
                var resolved = fieldset.querySelector('[data-system-resolved]');
                var systemLabel = function () { return media.matches ? 'dark' : 'light'; };
                var check = function (theme) {
                  var input = fieldset.querySelector('input[value="' + theme + '"]');
                  if (input) input.checked = true;
                };
                var renderResolved = function () {
                  if (resolved) resolved.textContent = ' (' + systemLabel() + ')';
                };
                fieldset.addEventListener('change', function (event) {
                  var theme = event.target.value;
                  window.bwhTheme.save(theme);
                  window.bwhTheme.apply(theme);
                  if (announce) {
                    announce.textContent = theme === 'system'
                      ? 'Theme set to system, currently ' + systemLabel()
                      : 'Theme set to ' + theme;
                  }
                });
                media.addEventListener('change', renderResolved);
                {{-- Cross-tab sync; the layout script already re-applies the page theme. --}}
                window.addEventListener('storage', function (event) {
                  if (event.key === 'theme') check(window.bwhTheme.read());
                });
                {{-- The cookie can disagree with cached/SSR markup; the client value wins. --}}
                check(window.bwhTheme.read());
                renderResolved();
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
