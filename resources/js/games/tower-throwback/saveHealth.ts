/**
 * Save-health policy for the dirty autosave loop.
 *
 * Pure scheduling decisions, kept out of React so they can be tested with fake
 * timers and no DOM. Two bounds cooperate:
 *
 *  - QUIET_MS debounces bursts. A bulk placement or a rapid build session emits
 *    many state-changing commands; writing once per command would serialize the
 *    whole tower dozens of times a second.
 *  - MAX_UNSAVED_MS caps the debounce. Without it, continuous activity (which
 *    is exactly when the player has the most to lose) would defer the write
 *    indefinitely — the failure mode this feature exists to remove.
 */

export const AUTOSAVE_QUIET_MS = 4_000
export const AUTOSAVE_MAX_UNSAVED_MS = 25_000

export type SaveHealthStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

export interface SaveHealth {
  status: SaveHealthStatus
  /** Epoch ms of the last SUCCESSFUL local write, or null if none this session. */
  lastSavedAt: number | null
  /** Present only while `status === 'failed'`; player-facing reason. */
  error: string | null
}

export function initialSaveHealth(): SaveHealth {
  return { status: 'idle', lastSavedAt: null, error: null }
}

export interface AutosaveSchedule {
  /** When the state first became dirty since the last write; null if clean. */
  dirtySince: number | null
  /** When the most recent dirtying command arrived. */
  lastDirtyAt: number | null
}

export function emptySchedule(): AutosaveSchedule {
  return { dirtySince: null, lastDirtyAt: null }
}

export function markDirty(schedule: AutosaveSchedule, now: number): AutosaveSchedule {
  return {
    dirtySince: schedule.dirtySince ?? now,
    lastDirtyAt: now,
  }
}

/**
 * Should the debounced autosave fire at `now`?
 *
 * True once activity has been quiet for QUIET_MS, OR the state has been dirty
 * for MAX_UNSAVED_MS regardless of ongoing activity.
 */
export function shouldAutosave(schedule: AutosaveSchedule, now: number): boolean {
  if (schedule.dirtySince === null || schedule.lastDirtyAt === null) {
    return false
  }

  return now - schedule.lastDirtyAt >= AUTOSAVE_QUIET_MS || now - schedule.dirtySince >= AUTOSAVE_MAX_UNSAVED_MS
}

/** Milliseconds until the next check is worth making; null when clean. */
export function msUntilAutosave(schedule: AutosaveSchedule, now: number): number | null {
  if (schedule.dirtySince === null || schedule.lastDirtyAt === null) {
    return null
  }
  const quietDeadline = schedule.lastDirtyAt + AUTOSAVE_QUIET_MS
  const hardDeadline = schedule.dirtySince + AUTOSAVE_MAX_UNSAVED_MS

  return Math.max(0, Math.min(quietDeadline, hardDeadline) - now)
}

/** Human-readable "last saved" for the HUD readout. */
export function describeLastSaved(lastSavedAt: number | null, now: number): string {
  if (lastSavedAt === null) {
    return 'not yet saved'
  }
  const seconds = Math.max(0, Math.round((now - lastSavedAt) / 1000))
  if (seconds < 10) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  return `${Math.floor(minutes / 60)}h ago`
}
