/**
 * Debounced dirty autosave.
 *
 * Before this, saves fired only on settlement / star-up and on tab hide, so a
 * crash or a hard browser kill between those points lost real construction and
 * management progress. `markDirty()` is called from the command path; the hook
 * coalesces bursts and guarantees a bounded worst-case unsaved window.
 *
 * The existing multi-tab ownership rules are untouched: a slot owned by another
 * tab must still refuse the write, and the caller's conflict handler still runs.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AutosaveSchedule,
  emptySchedule,
  initialSaveHealth,
  markDirty as markScheduleDirty,
  msUntilAutosave,
  type SaveHealth,
  shouldAutosave,
} from './saveHealth'

export type AutosaveOutcome =
  | { ok: true }
  | { ok: false; error: string; conflict: boolean }

export interface DirtyAutosaveOptions {
  /** Performs the actual write; returns whether it succeeded and why not. */
  save: () => AutosaveOutcome
  /** Disabled in visual-test mode and while no tower is loaded. */
  enabled: boolean
  /** Injectable for tests; defaults to the wall clock. */
  now?: () => number
}

export interface DirtyAutosave {
  health: SaveHealth
  /** Record that the tower changed and (re)arm the debounce. */
  markDirty: () => void
  /** Force an immediate write, bypassing the debounce (used by manual saves). */
  flush: () => void
}

const TICK_MS = 1_000

export function useDirtyAutosave({ save, enabled, now = Date.now }: DirtyAutosaveOptions): DirtyAutosave {
  const [health, setHealth] = useState<SaveHealth>(initialSaveHealth)
  const scheduleRef = useRef<AutosaveSchedule>(emptySchedule())
  const saveRef = useRef(save)
  const nowRef = useRef(now)

  useEffect(() => {
    saveRef.current = save
  }, [save])
  useEffect(() => {
    nowRef.current = now
  }, [now])

  const runSave = useCallback(() => {
    scheduleRef.current = emptySchedule()
    setHealth((prev) => ({ ...prev, status: 'saving' }))
    const result = saveRef.current()
    const at = nowRef.current()
    if (result.ok) {
      setHealth({ status: 'saved', lastSavedAt: at, error: null })
      return
    }
    // A conflict is handled by the caller (it tears the session down), so it is
    // not surfaced here as a failure the player is expected to act on.
    setHealth((prev) => ({
      status: result.conflict ? 'idle' : 'failed',
      lastSavedAt: prev.lastSavedAt,
      error: result.conflict ? null : result.error,
    }))
  }, [])

  const markDirty = useCallback(() => {
    if (!enabled) {
      return
    }
    scheduleRef.current = markScheduleDirty(scheduleRef.current, nowRef.current())
    setHealth((prev) => (prev.status === 'failed' ? prev : { ...prev, status: 'pending' }))
  }, [enabled])

  const flush = useCallback(() => {
    if (!enabled) {
      return
    }
    runSave()
  }, [enabled, runSave])

  useEffect(() => {
    if (!enabled) {
      return
    }
    // A single low-frequency timer rather than a per-command timeout: the
    // deadline can move with every command, and re-arming a timeout on each one
    // is both churn and a source of missed hard deadlines.
    const id = setInterval(() => {
      if (shouldAutosave(scheduleRef.current, nowRef.current())) {
        runSave()
      }
    }, TICK_MS)

    return () => clearInterval(id)
  }, [enabled, runSave])

  // Never leave the tower dirty on unmount — this is the crash-adjacent case
  // (navigating away) that the whole feature exists to cover.
  useEffect(() => {
    if (!enabled) {
      return
    }
    return () => {
      if (scheduleRef.current.dirtySince !== null) {
        saveRef.current()
      }
    }
  }, [enabled])

  return { health, markDirty, flush }
}

export { msUntilAutosave }
