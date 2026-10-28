/**
 * The building, its analysis, undo/redo and a local autosave. The prototype is
 * unlisted and never cloud-saved; browser storage may be unavailable, so every
 * read and write is guarded and the game works without it.
 *
 * Edits mutate the Building in place, then publish a new World wrapper so
 * React sees a new identity (and a new stamp) for every change.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { flushGameDataWrites, gameDataStorage } from '../_shared/gameDataPersistence'
import { BuildingAnalysis } from './engine/analysis'
import { type AnySnapshot, Building, type BuildingSnapshot, type EditResult, starterBuilding } from './engine/building'
import { TOWER_2_STORAGE_KEY } from './gameProgress'
import type { World } from './Tower2Scene'

export const STORAGE_KEY = TOWER_2_STORAGE_KEY
const HISTORY_LIMIT = 60
const SAVE_DELAY_MS = 400

/** The saved plan, or an empty site for a first visit (`fresh`), which starts the tutorial. */
export function loadBuilding(storage: Pick<Storage, 'getItem'> | null): { building: Building, fresh: boolean } {
  try {
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved) return { building: Building.fromSnapshot(JSON.parse(saved) as AnySnapshot), fresh: false }
  } catch {
    // A save from an older prototype, or one that no longer validates, starts over on an empty site.
  }
  return { building: new Building(), fresh: true }
}

/** The tower's storage: this browser when signed out, the account (with a local shadow) when signed in. */
function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return gameDataStorage()
  } catch {
    return null
  }
}

export interface WorldHistory {
  world: World
  apply: (commit: (building: Building) => EditResult) => EditResult
  undo: () => void
  redo: () => void
  /** Start over on an empty site or the example block; undo brings the old plan back. */
  reset: (start: 'empty' | 'example') => void
  /** True when this visit began without a saved plan. */
  firstVisit: boolean
  /** Delete the saved tower (the account copy too) and wait for that to reach the server, for a clean restart. */
  erase: () => Promise<void>
  canUndo: boolean
  canRedo: boolean
}

interface HistoryState {
  world: World
  undo: BuildingSnapshot[]
  redo: BuildingSnapshot[]
}

function fresh(building: Building, stamp: number): World {
  return { building, analysis: new BuildingAnalysis(building), stamp }
}

export function useWorld(): WorldHistory {
  const [initial] = useState(() => loadBuilding(storage()))
  const [state, setState] = useState<HistoryState>(() => ({ world: fresh(initial.building, 0), undo: [], redo: [] }))
  const saveTimerRef = useRef<number | undefined>(undefined)

  // Save shortly after the last change; the timer is cleared on unmount.
  useEffect(() => {
    if (state.world.stamp === 0) return undefined
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      try {
        storage()?.setItem(STORAGE_KEY, JSON.stringify(state.world.building.snapshot()))
      } catch {
        // Full or blocked storage: keep playing; the plan just won't survive a reload.
      }
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(saveTimerRef.current)
  }, [state.world])

  const apply = useCallback((commit: (building: Building) => EditResult): EditResult => {
    const { world } = state
    const before = world.building.snapshot()
    const revision = world.building.revision
    const result = commit(world.building)
    if (result.ok && world.building.revision !== revision) {
      setState((current) => ({
        world: { ...current.world, stamp: current.world.stamp + 1 },
        undo: [...current.undo.slice(1 - HISTORY_LIMIT), before],
        redo: [],
      }))
    }
    return result
  }, [state])

  const undo = useCallback(() => {
    setState((current) => {
      const previous = current.undo.at(-1)
      if (!previous) return current
      return {
        world: fresh(Building.fromSnapshot(previous), current.world.stamp + 1),
        undo: current.undo.slice(0, -1),
        redo: [...current.redo, current.world.building.snapshot()],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const next = current.redo.at(-1)
      if (!next) return current
      return {
        world: fresh(Building.fromSnapshot(next), current.world.stamp + 1),
        undo: [...current.undo, current.world.building.snapshot()],
        redo: current.redo.slice(0, -1),
      }
    })
  }, [])

  const reset = useCallback((start: 'empty' | 'example') => {
    setState((current) => ({
      world: fresh(start === 'example' ? starterBuilding() : new Building(), current.world.stamp + 1),
      undo: [...current.undo.slice(1 - HISTORY_LIMIT), current.world.building.snapshot()],
      redo: [],
    }))
  }, [])

  const erase = useCallback(async () => {
    window.clearTimeout(saveTimerRef.current)
    try {
      storage()?.removeItem(STORAGE_KEY)
      await flushGameDataWrites()
    } catch {
      // Offline or blocked storage: the deletion is queued or there was nothing to delete.
    }
  }, [])

  return { world: state.world, apply, undo, redo, reset, erase, firstVisit: initial.fresh, canUndo: state.undo.length > 0, canRedo: state.redo.length > 0 }
}
