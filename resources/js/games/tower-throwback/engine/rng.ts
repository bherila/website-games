/**
 * Tower Throwback — seeded RNG.
 *
 * Adapted from `resources/js/games/hover/engine/rng.ts`'s mulberry32. Hover's `Rng` is a plain
 * `() => number` closure; the `Rng` contract here (`../gameTypes.ts`) is a stateful object with
 * `next()` + `state()` so `EngineState` snapshots can expose and restore the PRNG's internal
 * counter. This wraps the same mulberry32 core to keep the output sequence identical for a given
 * seed.
 */

import type { Rng } from '../gameTypes'

/**
 * mulberry32 — tiny seedable PRNG so the sim is deterministic under test. `next()` returns
 * floats in [0, 1); `state()` exposes the internal counter for snapshotting.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    state(): number {
      return a
    },
  }
}

/** Resume a mulberry32 stream from a previously-saved `rng.state()` counter value. */
export function restoreRng(state: number): Rng {
  return createRng(state)
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive)
}

export function pickWeighted<T>(rng: Rng, entries: ReadonlyArray<{ value: T; weight: number }>): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = rng.next() * total
  let picked: T | undefined
  for (const entry of entries) {
    picked = entry.value
    roll -= entry.weight
    if (roll <= 0) {
      break
    }
  }
  if (picked === undefined) {
    throw new Error('pickWeighted: entries must be non-empty')
  }
  return picked
}
