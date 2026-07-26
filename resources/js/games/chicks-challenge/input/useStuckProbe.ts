import { useEffect, useRef } from 'react'

import { createSolver } from '../engine/solver'
import type { GameState } from '../engine/types'

/** Idle debounce after the last accepted move before a probe starts. */
export const STUCK_PROBE_DEBOUNCE_MS = 400
/** Search nodes expanded per idle time-slice (keeps the main thread responsive). */
export const STUCK_PROBE_NODES_PER_SLICE = 2500
/** Solver node budget for one probe — beyond this the level is just "big", not stuck. */
export const STUCK_PROBE_MAX_NODES = 40_000

interface UseStuckProbeOptions {
  /** Current engine state; a new reference (i.e. any accepted move) restarts the probe. */
  state: GameState | null
  /** Arm the probe — false while not playing, already won/dead, or already flagged stuck. */
  active: boolean
  onStuck: () => void
}

/**
 * Runtime dead-end detector: once input settles after an accepted move, runs
 * `createSolver` from the current state in small time-sliced chunks so the UI
 * stays responsive. Only a definitive `'unsolvable'` result calls `onStuck` —
 * `'solved'` and `'budget'` are silently ignored (a big level is not a dead
 * end). Any state change (new move, restart, level swap) or `active`
 * flipping false cancels the in-flight probe.
 */
export function useStuckProbe({ state, active, onStuck }: UseStuckProbeOptions): void {
  const onStuckRef = useRef(onStuck)

  useEffect(() => {
    onStuckRef.current = onStuck
  }, [onStuck])

  useEffect(() => {
    if (!active || !state || !state.alive || state.won) {
      return undefined
    }

    let cancelled = false
    let sliceTimeoutId: number | null = null

    const debounceId = window.setTimeout(() => {
      const solver = createSolver(state, { maxNodes: STUCK_PROBE_MAX_NODES })

      const runSlice = (): void => {
        if (cancelled) {
          return
        }
        const status = solver.step(STUCK_PROBE_NODES_PER_SLICE)
        if (cancelled) {
          return
        }
        if (status === 'unsolvable') {
          onStuckRef.current()

          return
        }
        if (status === 'running') {
          sliceTimeoutId = window.setTimeout(runSlice, 0)
        }
        // 'solved' / 'budget' -> done, no callback.
      }

      runSlice()
    }, STUCK_PROBE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
      if (sliceTimeoutId !== null) {
        window.clearTimeout(sliceTimeoutId)
      }
    }
  }, [state, active])
}
