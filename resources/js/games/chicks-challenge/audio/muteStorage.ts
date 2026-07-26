/** Versioned localStorage key for the SFX mute toggle. Defensive parsing: any corruption -> unmuted. */
const MUTE_STORAGE_KEY = 'bwh.chicks-challenge.muted.v1'

export function loadMuted(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const raw = window.localStorage.getItem(MUTE_STORAGE_KEY)
    if (raw === null) {
      return false
    }
    const parsed: unknown = JSON.parse(raw)

    return parsed === true
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, JSON.stringify(muted))
  } catch {
    // Storage unavailable (private mode, quota) — mute preference just won't persist.
  }
}
