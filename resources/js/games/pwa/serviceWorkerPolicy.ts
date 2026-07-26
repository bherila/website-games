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

export function isPwaStaticAsset(url: URL, currentOrigin: string): boolean {
  return url.origin === currentOrigin
    && (url.pathname.startsWith('/pwa/') || url.pathname === '/manifest.webmanifest')
}

export function isGameNavigation(request: Request, currentOrigin: string): boolean {
  const url = new URL(request.url)

  return request.mode === 'navigate'
    && url.origin === currentOrigin
    && (url.pathname === '/games' || url.pathname.startsWith('/games/'))
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
