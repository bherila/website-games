export const GAME_CACHE_PREFIX = 'bwh-games-'
export const LAST_AUTHENTICATED_USER_KEY = 'bwh.games.last-authenticated-user.v1'

export interface GameCacheNames {
  assets: string
  audio: string
  shells: string
}

export function gameCacheNames(version: string): GameCacheNames {
  return {
    assets: `${GAME_CACHE_PREFIX}assets-${version}`,
    audio: `${GAME_CACHE_PREFIX}audio-${version}`,
    shells: `${GAME_CACHE_PREFIX}shells-${version}`,
  }
}

export function isHashedBuildAsset(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin && url.pathname.startsWith('/build/assets/')
}

export function isVersionedGameAudio(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin && url.pathname.startsWith('/audio/games/')
}

/**
 * Mandarin Quest speech, served from `/media/games/mandarin/{asset}/{hash}.{ext}`
 * rather than the static `/audio/games/` tree. The 64-hex hash is the content
 * digest, so a URL that resolves once resolves to those exact bytes forever and
 * is safe to serve cache-first with no revalidation.
 */
export function isMandarinMediaAudio(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin
    && /^\/media\/games\/mandarin\/\d+\/[a-f0-9]{64}\.(mp3|m4a|wav)$/.test(url.pathname)
}

export function isPwaStaticAsset(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin
    && (url.pathname.startsWith('/pwa/') || url.pathname === '/manifest.webmanifest')
}

/**
 * Sign-in navigations, which must always reach the network.
 *
 * `/oauth/redirect` answers with a cross-origin 302 to the identity provider and
 * `/oauth/callback` exchanges the code and establishes the session — neither has
 * a meaningful cached form. Left to the network-first shell handler they race a
 * 3s timeout and, on a slow connection, fall back to a cached page: the callback
 * never runs, no session is created, and the player lands on a games page that
 * looks signed in only because the account id is still in local storage.
 */
export function isAuthNavigation(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin
    && (url.pathname === '/login' || url.pathname === '/logout' || url.pathname.startsWith('/oauth/'))
}

export function isGameNavigation(request: Request, currentOrigin: string): boolean {
  const url = new URL(request.url)

  // Every page this app serves is a game page — the whole origin is in scope,
  // minus the sign-in routes, which are never answered from cache.
  return request.mode === 'navigate'
    && url.origin === currentOrigin
    && !isAuthNavigation(url, currentOrigin)
}

export function sanitizeGameShellHtml(html: string): string | null {
  const initialDataPattern = /(<script\b[^>]*\bid=(["'])app-initial-data\2[^>]*>)([\s\S]*?)(<\/script>)/i
  const match = initialDataPattern.exec(html)
  if (!match) {
    return null
  }

  try {
    const initialData = JSON.parse(match[3]!.trim()) as Record<string, unknown>
    const sanitized = {
      appName: initialData.appName,
      appUrl: initialData.appUrl,
      authenticated: false,
      isAdmin: false,
      permissions: [],
      clientCompanies: [],
      currentUser: null,
      navItems: [],
      accountMenuItems: [],
      commandDestinations: [],
      pwaCachedShell: true,
    }
    const serialized = JSON.stringify(sanitized)
      .replaceAll('&', '\\u0026')
      .replaceAll('<', '\\u003c')
      .replaceAll('>', '\\u003e')

    return html
      .replace(initialDataPattern, `${match[1]}${serialized}${match[4]}`)
      .replace(
        /(<meta\b[^>]*\bname=(["'])csrf-token\2[^>]*\bcontent=(["']))[^"']*(\3[^>]*>)/i,
        '$1$4',
      )
  } catch {
    return null
  }
}
