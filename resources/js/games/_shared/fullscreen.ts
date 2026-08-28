/**
 * Element Fullscreen API helpers with WebKit-prefixed fallbacks.
 *
 * iPhone Safari exposes neither `fullscreenEnabled` nor
 * `webkitFullscreenEnabled` on `document` (iPad and Android/desktop do), so
 * `isFullscreenSupported()` is the gate for showing any fullscreen UI. An
 * installed PWA (`display-mode: standalone`) is already chrome-less, so it is
 * treated as "fullscreen affordance not needed" via
 * `isStandaloneDisplayMode()`.
 */

interface WebkitDocument extends Document {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

interface WebkitElement extends Element {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface StandaloneNavigator extends Navigator {
  standalone?: boolean
}

export function isFullscreenSupported(doc: Document = document): boolean {
  const d = doc as WebkitDocument
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled)
}

export function isStandaloneDisplayMode(win: Window = window): boolean {
  return (
    win.matchMedia('(display-mode: standalone)').matches ||
    (win.navigator as StandaloneNavigator).standalone === true
  )
}

export function isFullscreenActive(doc: Document = document): boolean {
  const d = doc as WebkitDocument
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement)
}

export async function requestAppFullscreen(el: Element = document.documentElement): Promise<void> {
  const target = el as WebkitElement
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' })
    } else if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen()
    }
  } catch (error) {
    // Denied without a qualifying user gesture, or by browser policy.
    console.warn('Fullscreen request rejected', error)
  }
}

export async function exitAppFullscreen(doc: Document = document): Promise<void> {
  const d = doc as WebkitDocument
  try {
    if (d.exitFullscreen) {
      await d.exitFullscreen()
    } else if (d.webkitExitFullscreen) {
      await d.webkitExitFullscreen()
    }
  } catch (error) {
    console.warn('Fullscreen exit rejected', error)
  }
}

export function subscribeFullscreenChange(callback: () => void, doc: Document = document): () => void {
  doc.addEventListener('fullscreenchange', callback)
  doc.addEventListener('webkitfullscreenchange', callback)
  return () => {
    doc.removeEventListener('fullscreenchange', callback)
    doc.removeEventListener('webkitfullscreenchange', callback)
  }
}
