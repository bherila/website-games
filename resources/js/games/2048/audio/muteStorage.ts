import { TWENTY48_MUTED_STORAGE_KEY } from '../gameTypes'

/**
 * Mute is a device preference, not progress: it stays in raw `localStorage` and
 * is never promoted to the account row (see docs/games/persistence.md).
 * Defensive parsing — any corruption reads as unmuted.
 */
export function loadMuted(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(TWENTY48_MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(TWENTY48_MUTED_STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Private browsing can decline the preference without blocking play.
  }
}
