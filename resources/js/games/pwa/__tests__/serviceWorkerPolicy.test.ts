import {
  GAME_CACHE_PREFIX,
  gameBuildAssets,
  gameCacheNames,
  isAuthNavigation,
  isGameNavigation,
  isHashedBuildAsset,
  isMandarinMediaAudio,
  isNetworkOnlyNavigation,
  isPwaStaticAsset,
  isVersionedGameAudio,
  sanitizeGameShellHtml,
} from '../serviceWorkerPolicy'

describe('games service worker policy', () => {
  const origin = 'https://games.example.test'

  it('precaches every game entry with the chunks, styles and emitted files it needs, but not the operator panel', () => {
    expect(gameBuildAssets({
      'resources/css/app.css': { file: 'assets/app-1.css', isEntry: true, assets: ['assets/font-11.woff2'] },
      // A sprite sheet loaded at runtime is emitted beside its chunk, not imported.
      'resources/js/games/tower-throwback/index.tsx': { file: 'assets/tower-12.js', isEntry: true, assets: ['assets/style-gate-13.webp', 'assets/lobby-14.svg'] },
      'resources/js/games/plate-escape/index.tsx': { file: 'assets/plate-2.js', isEntry: true, imports: ['_three.js', '_shared.js'], css: ['assets/plate-3.css'] },
      'resources/js/games/2048/index.tsx': { file: 'assets/2048-4.js', isEntry: true, imports: ['_shared.js'] },
      '_three.js': { file: 'assets/three-5.js', imports: ['_shared.js'] },
      // A cycle between shared chunks must not loop.
      '_shared.js': { file: 'assets/shared-6.js', imports: ['_three.js'], css: ['assets/shared-7.css'] },
      'resources/js/admin/index.tsx': { file: 'assets/admin-8.js', isEntry: true, imports: ['_admin.js'] },
      '_admin.js': { file: 'assets/admin-chunk-9.js' },
      // Not an entry: only reached through an entry's imports.
      'resources/js/games/plate-escape/lazy.ts': { file: 'assets/lazy-10.js' },
    })).toEqual([
      '/build/assets/2048-4.js',
      '/build/assets/app-1.css',
      '/build/assets/font-11.woff2',
      '/build/assets/lobby-14.svg',
      '/build/assets/plate-2.js',
      '/build/assets/plate-3.css',
      '/build/assets/shared-6.js',
      '/build/assets/shared-7.css',
      '/build/assets/style-gate-13.webp',
      '/build/assets/three-5.js',
      '/build/assets/tower-12.js',
    ])
  })

  it('uses deploy-versioned cache names', () => {
    expect(gameCacheNames('commit-123')).toEqual({
      assets: `${GAME_CACHE_PREFIX}assets-commit-123`,
      audio: `${GAME_CACHE_PREFIX}audio-commit-123`,
      shells: `${GAME_CACHE_PREFIX}shells-commit-123`,
    })
  })

  it('cache-first targets Vite-hashed assets but never API data', () => {
    expect(isHashedBuildAsset(new URL('/build/assets/index-AbCd1234.js', origin), origin)).toBe(true)
    expect(isHashedBuildAsset(new URL('/api/games/data', origin), origin)).toBe(false)
  })

  it('version-caches non-hashed game audio separately', () => {
    expect(isVersionedGameAudio(new URL('/audio/games/cars/car-blocked.mp3', origin), origin)).toBe(true)
    expect(isVersionedGameAudio(new URL('/audio/site-notification.mp3', origin), origin)).toBe(false)
  })

  it('caches only the manifest and PWA icon directory as PWA static assets', () => {
    expect(isPwaStaticAsset(new URL('/manifest.webmanifest', origin), origin)).toBe(true)
    expect(isPwaStaticAsset(new URL('/pwa/icon-192.png', origin), origin)).toBe(true)
    expect(isPwaStaticAsset(new URL('/images/private-export.png', origin), origin)).toBe(false)
  })

  it('recognizes any same-origin navigation as a game navigation', () => {
    // Every page this app serves is a game page (see #1803's follow-up dropping the
    // '/games' route prefix), so the only thing left to check is same-origin + navigate.
    expect(isGameNavigation({ mode: 'navigate', url: `${origin}/` } as Request, origin)).toBe(true)
    expect(isGameNavigation({ mode: 'navigate', url: `${origin}/2048` } as Request, origin)).toBe(true)
    expect(isGameNavigation({ mode: 'navigate', url: `${origin}/tower-throwback` } as Request, origin)).toBe(true)
    expect(isGameNavigation({ mode: 'cors', url: `${origin}/` } as Request, origin)).toBe(false)
    expect(isGameNavigation({ mode: 'navigate', url: 'https://other.example/' } as Request, origin)).toBe(false)
  })

  it('removes authentication, CSRF, and PII from cached game shells', () => {
    const html = `
      <meta name="csrf-token" content="session-token">
      <script id="app-initial-data" type="application/json">{
        "appName":"BWH",
        "appUrl":"https://games.example.test",
        "authenticated":true,
        "isAdmin":true,
        "permissions":["private"],
        "currentUser":{"id":7,"name":"Private Person","email":"private@example.test"},
        "clientCompanies":[{"id":8,"company_name":"Private Company"}],
        "navItems":[{"type":"link","label":"Private","href":"/private"}]
      }</script>
    `

    const sanitized = sanitizeGameShellHtml(html)

    expect(sanitized).not.toContain('session-token')
    expect(sanitized).not.toContain('Private Person')
    expect(sanitized).not.toContain('private@example.test')
    expect(sanitized).not.toContain('Private Company')
    expect(sanitized).not.toContain('/private')
    expect(sanitized).toContain('"authenticated":false')
    expect(sanitized).toContain('"pwaCachedShell":true')
    expect(sanitized).toContain('content=""')
  })

  it('refuses to cache HTML without valid initial-data JSON', () => {
    expect(sanitizeGameShellHtml('<main>Missing shell metadata</main>')).toBeNull()
    expect(sanitizeGameShellHtml('<script id="app-initial-data">{invalid}</script>')).toBeNull()
  })
})

describe('mandarin media and sign-in routes', () => {
  const origin = 'https://games.bherila.net'
  const media = `/media/games/mandarin/12/HASH.mp3`.replace('HASH', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

  it('treats content-hashed mandarin speech as cacheable audio', () => {
    expect(isMandarinMediaAudio(new URL(media, origin), origin)).toBe(true)
    // Not the manifest route, not another origin, not an unhashed path.
    expect(isMandarinMediaAudio(new URL('/media/games/mandarin/12/short.mp3', origin), origin)).toBe(false)
    expect(isMandarinMediaAudio(new URL(media, 'https://elsewhere.test'), origin)).toBe(false)
  })

  it('never answers a sign-in navigation from cache', () => {
    // `/oauth/callback` establishes the session; served from the shell cache on
    // a slow connection it would silently never run.
    for (const path of ['/login', '/logout', '/oauth/redirect', '/oauth/callback']) {
      expect(isAuthNavigation(new URL(path, origin), origin)).toBe(true)
      const request = { url: new URL(path, origin).toString(), mode: 'navigate' } as Request
      expect(isGameNavigation(request, origin)).toBe(false)
    }

    const game = { url: new URL('/mandarin', origin).toString(), mode: 'navigate' } as Request
    expect(isGameNavigation(game, origin)).toBe(true)
  })

  it('never caches a page that shows the signed-in account, and caches every game page', () => {
    // Shell scrubbing only clears the initial-data JSON; these pages render the account's
    // name, email and form tokens into the markup itself, so they must stay network-only.
    for (const path of ['/account', '/account/email/confirm/token', '/admin', '/admin/mandarin/audio', '/login', '/oauth/callback']) {
      expect(isNetworkOnlyNavigation(new URL(path, origin), origin)).toBe(true)
      expect(isGameNavigation({ url: new URL(path, origin).toString(), mode: 'navigate' } as Request, origin)).toBe(false)
    }
    for (const path of ['/', '/accounting-quiz', '/administer-quest', '/plate-escape', '/chicks-challenge']) {
      expect(isNetworkOnlyNavigation(new URL(path, origin), origin)).toBe(false)
      expect(isGameNavigation({ url: new URL(path, origin).toString(), mode: 'navigate' } as Request, origin)).toBe(true)
    }
  })
})
