import { act, renderHook } from '@testing-library/react'

import type { GameState } from '../engine/types'
import { STUCK_PROBE_DEBOUNCE_MS, STUCK_PROBE_NODES_PER_SLICE, useStuckProbe } from '../input/useStuckProbe'
import { parseLevel } from '../levels/parseLevel'

// Pushing the block right is the only route toward the exit, but doing so
// seals the exit's only approach behind it — a genuine dead end, not just a
// long solve (mirrors the fixture in solverUnit.test.ts's unsolvable cases).
const UNSOLVABLE_GRID = ['#####', '#.X.#', '#@#E#', '#####']
const SOLVABLE_GRID = ['#####', '#@.E#', '#####']

function level(grid: readonly string[]): GameState {
  return parseLevel({ id: 1, title: 'fixture', par: 1, grid })
}

/** Advances the debounce plus enough 0ms solver slices to let a tiny fixture resolve. */
function runProbeToCompletion(): void {
  act(() => {
    jest.advanceTimersByTime(STUCK_PROBE_DEBOUNCE_MS)
  })
  for (let i = 0; i < 10; i++) {
    act(() => {
      jest.advanceTimersByTime(0)
    })
  }
}

describe('useStuckProbe', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('flags stuck once the debounced probe proves the position unsolvable', () => {
    const onStuck = jest.fn()
    renderHook(({ state }) => useStuckProbe({ active: true, onStuck, state }), {
      initialProps: { state: level(UNSOLVABLE_GRID) },
    })

    runProbeToCompletion()

    expect(onStuck).toHaveBeenCalledTimes(1)
  })

  it('never flags stuck for a solvable position', () => {
    const onStuck = jest.fn()
    renderHook(({ state }) => useStuckProbe({ active: true, onStuck, state }), {
      initialProps: { state: level(SOLVABLE_GRID) },
    })

    runProbeToCompletion()

    expect(onStuck).not.toHaveBeenCalled()
  })

  it('does not schedule a probe while inactive', () => {
    const onStuck = jest.fn()
    renderHook(({ state }) => useStuckProbe({ active: false, onStuck, state }), {
      initialProps: { state: level(UNSOLVABLE_GRID) },
    })

    runProbeToCompletion()

    expect(onStuck).not.toHaveBeenCalled()
  })

  it('cancels the in-flight probe when a new move lands before it resolves', () => {
    const onStuck = jest.fn()
    const { rerender } = renderHook(({ state }) => useStuckProbe({ active: true, onStuck, state }), {
      initialProps: { state: level(UNSOLVABLE_GRID) },
    })

    // Let the debounce almost elapse, then simulate an accepted move landing
    // on a solvable position before the original (unsolvable) probe fires.
    act(() => {
      jest.advanceTimersByTime(STUCK_PROBE_DEBOUNCE_MS - 50)
    })
    rerender({ state: level(SOLVABLE_GRID) })

    // If cancellation failed, the stale debounce would fire ~50ms into this
    // window and run a solver over the unsolvable fixture instead.
    runProbeToCompletion()

    expect(onStuck).not.toHaveBeenCalled()
  })

  it('exports node-per-slice and debounce constants for callers/tests to drive', () => {
    expect(STUCK_PROBE_DEBOUNCE_MS).toBeGreaterThan(0)
    expect(STUCK_PROBE_NODES_PER_SLICE).toBeGreaterThan(0)
  })
})
