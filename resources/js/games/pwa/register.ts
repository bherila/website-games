import { clearGamePwaSession } from './cacheCleanup'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

export interface GamesPwaBridge {
  installPrompt: BeforeInstallPromptEvent | null
  clearCaches: () => Promise<void>
}

declare global {
  interface Window {
    bwhGamesPwa?: GamesPwaBridge
  }
}

const bridge: GamesPwaBridge = {
  installPrompt: null,
  clearCaches: clearGamePwaSession,
}

window.bwhGamesPwa = bridge

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  bridge.installPrompt = event as BeforeInstallPromptEvent
  window.dispatchEvent(new Event('bwh-games-install-available'))
})

window.addEventListener('appinstalled', () => {
  bridge.installPrompt = null
  window.dispatchEvent(new Event('bwh-games-install-available'))
})

document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || new URL(form.action).pathname !== '/logout') {
    return
  }

  event.preventDefault()
  void clearGamePwaSession().finally(() => form.submit())
}, { capture: true })

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerGamesServiceWorker()
  })
}

async function registerGamesServiceWorker(): Promise<void> {
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const registration = await navigator.serviceWorker.ready
    const worker = registration.active
    if (!worker) {
      return
    }

    worker.postMessage({ type: 'CACHE_GAME_ASSETS', urls: currentGameAssetUrls() })
    worker.postMessage({ type: 'CACHE_GAME_SHELL', url: window.location.href })
  } catch (error) {
    console.error('Unable to register the games service worker.', error)
  }
}

function currentGameAssetUrls(): string[] {
  const urls = new Set<string>()
  for (const entry of performance.getEntriesByType('resource')) {
    urls.add(entry.name)
  }
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')
    .forEach((element) => {
      const candidate = element instanceof HTMLScriptElement ? element.src : element.href
      if (candidate) {
        urls.add(candidate)
      }
    })

  return [...urls]
}
