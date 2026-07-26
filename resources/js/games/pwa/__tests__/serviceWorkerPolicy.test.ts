import {
  GAME_CACHE_PREFIX,
  gameCacheNames,
  isGameNavigation,
  isHashedBuildAsset,
  isPwaStaticAsset,
  isVersionedGameAudio,
  sanitizeGameShellHtml,
} from '../serviceWorkerPolicy'

describe('games service worker policy', () => {
  const origin = 'https://games.example.test'

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
