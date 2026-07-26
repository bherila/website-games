/**
 * Curated campaign levels. Marble Sort boards are fully determined by
 * (level, seed): the generator proves solvability with its solver before
 * accepting a board, so curation here means pinning a seed whose board plays
 * well. `levels.test.ts` asserts every entry generates a real (non-fallback)
 * solvable board — bump a seed if a generator change ever degrades one.
 *
 * Add levels by appending entries; the level select, unlock watermark, and
 * finale messaging derive from the array length.
 */

export interface MarbleLevelDef {
  id: number
  /** Seed for the generator; defaults to the classic per-level seed formula. */
  seed?: number
}

export const MARBLE_LEVELS: readonly MarbleLevelDef[] = Array.from(
  { length: 25 },
  (_, index) => ({ id: index + 1 }),
)

export const TOTAL_LEVELS = MARBLE_LEVELS.length
