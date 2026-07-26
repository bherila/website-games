/// <reference lib="webworker" />

import {
  GAME_CACHE_PREFIX,
  gameCacheNames,
  isGameNavigation,
  isHashedBuildAsset,
  isPwaStaticAsset,
  isVersionedGameAudio,
  sanitizeGameShellHtml,
} from './serviceWorkerPolicy'

declare const __PWA_CACHE_VERSION__: string

const worker = self as unknown as ServiceWorkerGlobalScope
const cacheNames = gameCacheNames(__PWA_CACHE_VERSION__)

worker.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(Promise.all([
    worker.skipWaiting(),
    cachePwaBootstrap(),
  ]).then(() => undefined))
})

worker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const currentCaches = new Set(Object.values(cacheNames))
    const existingCaches = await caches.keys()
    await Promise.all(existingCaches
      .filter((cacheName) => cacheName.startsWith(GAME_CACHE_PREFIX) && !currentCaches.has(cacheName))
      .map((cacheName) => caches.delete(cacheName)))
    await worker.clients.claim()
  })())
})

worker.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data === 'CLEAR_GAME_CACHES') {
    event.waitUntil(clearGameCaches())

    return
  }

  if (isCacheAssetsMessage(event.data)) {
    event.waitUntil(cacheGameAssets(event.data.urls))

    return
  }

  if (isCacheShellMessage(event.data)) {
    event.waitUntil(cacheGameShellUrl(event.data.url))
  }
})

worker.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (isGameNavigation(request, worker.location.origin)) {
    event.respondWith(networkFirstGameShell(request))

    return
  }

  if (isVersionedGameAudio(url, worker.location.origin)) {
    event.respondWith(staleWhileRevalidate(request, cacheNames.audio))

    return
  }

  if (isHashedBuildAsset(url, worker.location.origin) || isPwaStaticAsset(url, worker.location.origin)) {
    event.respondWith(cacheFirst(request, cacheNames.assets))
  }
})

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }

  return response
}

async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone())
    }

    return response
  })

  return cached ?? network
}

async function clearGameCaches(): Promise<void> {
  const cacheKeys = await caches.keys()
  await Promise.all(cacheKeys
    .filter((cacheName) => cacheName.startsWith(GAME_CACHE_PREFIX))
    .map((cacheName) => caches.delete(cacheName)))
}

async function cachePwaBootstrap(): Promise<void> {
  const assets = [
    '/manifest.webmanifest',
    '/pwa/icon-192.png',
    '/pwa/icon-512.png',
    '/pwa/icon-maskable-192.png',
    '/pwa/icon-maskable-512.png',
    '/audio/games/cars/car-blocked.mp3',
    '/audio/games/cars/car-park-success.mp3',
    '/audio/games/cars/level-complete.mp3',
    '/audio/games/cars/passenger-board.mp3',
  ]
  await cacheGameAssets(assets)

  try {
    const request = new Request('/', { credentials: 'include' })
    const response = await fetch(request)
    await cacheSanitizedGameShell(request, response)
  } catch {
    // The current page can still seed its shell and assets after activation.
  }
}

async function cacheGameShellUrl(candidate: string): Promise<void> {
  const url = new URL(candidate, worker.location.origin)
  if (!isGamesUrl(url)) {
    return
  }

  try {
    const request = new Request(url, { credentials: 'include' })
    const response = await fetch(request)
    await cacheSanitizedGameShell(request, response)
  } catch {
    // NetworkFirst will retry on the next controlled navigation.
  }
}

async function networkFirstGameShell(request: Request): Promise<Response> {
  const networkRequest = fetch(request).then(async (response) => {
    try {
      await cacheSanitizedGameShell(request, response)
    } catch {
      // Cache quota or storage failures must never block a live navigation.
    }

    return response
  })
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = worker.setTimeout(() => reject(new Error('Game shell network timeout.')), 3_000)
  })

  try {
    return await Promise.race([networkRequest, timeout])
  } catch {
    const cache = await caches.open(cacheNames.shells)
    const cached = await cache.match(request)
      ?? await cache.match('/')
    if (cached) {
      return cached
    }

    return networkRequest
  } finally {
    if (timeoutId !== undefined) {
      worker.clearTimeout(timeoutId)
    }
  }
}

async function cacheSanitizedGameShell(request: Request, response: Response): Promise<void> {
  if (
    !response.ok
    || (response.redirected && !isGamesUrl(new URL(response.url)))
    || !response.headers.get('Content-Type')?.includes('text/html')
  ) {
    return
  }

  const sanitizedHtml = sanitizeGameShellHtml(await response.clone().text())
  if (sanitizedHtml === null) {
    return
  }

  const headers = new Headers(response.headers)
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  const cache = await caches.open(cacheNames.shells)
  await cache.put(request, new Response(sanitizedHtml, {
    headers,
    status: response.status,
    statusText: response.statusText,
  }))
}

async function cacheGameAssets(urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map(async (candidate) => {
    const url = new URL(candidate, worker.location.origin)
    if (isVersionedGameAudio(url, worker.location.origin)) {
      await fetchAndCache(url, cacheNames.audio)
    } else if (isHashedBuildAsset(url, worker.location.origin) || isPwaStaticAsset(url, worker.location.origin)) {
      await fetchAndCache(url, cacheNames.assets)
    }
  }))
}

async function fetchAndCache(url: URL, cacheName: string): Promise<void> {
  try {
    const response = await fetch(url)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      await cache.put(url, response)
    }
  } catch {
    // A later controlled visit will retry through the runtime cache.
  }
}

function isCacheAssetsMessage(value: unknown): value is { type: 'CACHE_GAME_ASSETS', urls: string[] } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown, urls?: unknown }

  return candidate.type === 'CACHE_GAME_ASSETS'
    && Array.isArray(candidate.urls)
    && candidate.urls.every((url) => typeof url === 'string')
}

function isCacheShellMessage(value: unknown): value is { type: 'CACHE_GAME_SHELL', url: string } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown, url?: unknown }

  return candidate.type === 'CACHE_GAME_SHELL' && typeof candidate.url === 'string'
}

function isGamesUrl(url: URL): boolean {
  // Every page this app serves is a game page — see isGameNavigation in
  // serviceWorkerPolicy.ts for why this no longer checks a '/games' prefix.
  return url.origin === worker.location.origin
}
