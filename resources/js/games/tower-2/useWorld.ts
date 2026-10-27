/**
 * The building, its analysis, undo/redo and a local autosave. The prototype is
 * unlisted and never cloud-saved; browser storage may be unavailable, so every
 * read and write is guarded and the game works without it.
 *
 * Edits mutate the Building in place, then publish a new World wrapper so
 * React sees a new identity (and a new stamp) for every change.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { BuildingAnalysis } from './engine/analysis'
import { Building, type BuildingSnapshot, type EditResult, starterBuilding } from './engine/building'
import type { World } from './Tower2Scene'

export const STORAGE_KEY = 'tower-2-prototype'
const HISTORY_LIMIT = 60
const SAVE_DELAY_MS = 400

export function loadBuilding(storage: Pick<Storage, 'getItem'> | null): Building {
  try {
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved) return Building.fromSnapshot(JSON.parse(saved) as BuildingSnapshot)
  } catch {
    // A save from an older prototype, or one that no longer validates, falls back to the starter lot.
  }
  return starterBuilding()
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export interface WorldHistory {
  world: World
  apply: (commit: (building: Building) => EditResult) => EditResult
  undo: () => void
  redo: () => void
  reset: () => void
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
  const [state, setState] = useState<HistoryState>(() => ({ world: fresh(loadBuilding(storage()), 0), undo: [], redo: [] }))
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

  const reset = useCallback(() => {
    setState((current) => ({
      world: fresh(starterBuilding(), current.world.stamp + 1),
      undo: [...current.undo.slice(1 - HISTORY_LIMIT), current.world.building.snapshot()],
      redo: [],
    }))
  }, [])

  return { world: state.world, apply, undo, redo, reset, canUndo: state.undo.length > 0, canRedo: state.redo.length > 0 }
}
