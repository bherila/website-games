import {
  GAME_CACHE_PREFIX,
  LAST_AUTHENTICATED_USER_KEY,
} from './serviceWorkerPolicy'

export async function clearGamePwaSession(): Promise<void> {
  try {
    window.localStorage.removeItem(LAST_AUTHENTICATED_USER_KEY)
  } catch {
    // Cache cleanup still proceeds when persistent storage is unavailable.
  }

  if ('caches' in window) {
    const cacheKeys = await window.caches.keys()
    await Promise.all(cacheKeys
      .filter((cacheName) => cacheName.startsWith(GAME_CACHE_PREFIX))
      .map((cacheName) => window.caches.delete(cacheName)))
  }

  navigator.serviceWorker?.controller?.postMessage('CLEAR_GAME_CACHES')
}
