/**
 * Presentation-only player preferences (colour-vision mode, motion).
 *
 * These never reach the engine: nothing here is serialized into a save, read by
 * `stepEngine`, or allowed to influence an rng draw. They live in their own
 * localStorage key so the save wire contract is untouched, and every read is
 * defensive — a blocked or corrupt storage falls back to defaults rather than
 * throwing into the render path.
 */

export type DiagnosticPaletteMode = 'classic' | 'colorSafe'

/** `system` follows `prefers-reduced-motion`; the others are explicit overrides. */
export type MotionPreference = 'system' | 'full' | 'reduced'

export interface PresentationPrefs {
  diagnosticPalette: DiagnosticPaletteMode
  motion: MotionPreference
}

const STORAGE_KEY = 'towerThrowback.presentation.v1'

export function defaultPresentationPrefs(): PresentationPrefs {
  return { diagnosticPalette: 'classic', motion: 'system' }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isPaletteMode(value: unknown): value is DiagnosticPaletteMode {
  return value === 'classic' || value === 'colorSafe'
}

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'system' || value === 'full' || value === 'reduced'
}

export function loadPresentationPrefs(): PresentationPrefs {
  const storage = safeLocalStorage()
  const defaults = defaultPresentationPrefs()
  if (!storage) {
    return defaults
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaults
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return defaults
    }
    const record = parsed as Record<string, unknown>

    return {
      diagnosticPalette: isPaletteMode(record.diagnosticPalette) ? record.diagnosticPalette : defaults.diagnosticPalette,
      motion: isMotionPreference(record.motion) ? record.motion : defaults.motion,
    }
  } catch {
    return defaults
  }
}

/** Best-effort persist; a full or blocked storage must never break the HUD. */
export function savePresentationPrefs(prefs: PresentationPrefs): void {
  const storage = safeLocalStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; losing them is not worth surfacing.
  }
}
