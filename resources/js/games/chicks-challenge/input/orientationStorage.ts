/**
 * Versioned localStorage key for the board-rotation preference. This is a
 * device-only setting (like the mute toggle) and deliberately does NOT go
 * through the account-sync layer in `_shared/gameDataPersistence.ts`.
 * Defensive parsing: anything unexpected -> 'auto'.
 */
import { BOARD_ORIENTATION_PREFERENCES, type BoardOrientationPreference } from './orientation'

const BOARD_ORIENTATION_STORAGE_KEY = 'bwh.chicks-challenge.board-orientation.v1'

function isPreference(value: unknown): value is BoardOrientationPreference {
  return typeof value === 'string' && BOARD_ORIENTATION_PREFERENCES.includes(value as BoardOrientationPreference)
}

export function loadBoardOrientationPreference(): BoardOrientationPreference {
  if (typeof window === 'undefined') {
    return 'auto'
  }

  try {
    const raw = window.localStorage.getItem(BOARD_ORIENTATION_STORAGE_KEY)
    if (raw === null) {
      return 'auto'
    }
    const parsed: unknown = JSON.parse(raw)

    return isPreference(parsed) ? parsed : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveBoardOrientationPreference(preference: BoardOrientationPreference): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(BOARD_ORIENTATION_STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // Storage unavailable (private mode, quota) — the preference just won't persist.
  }
}
