import { type Direction, DIRECTION_DELTAS } from '../engine/types'
import { BUMP_NUDGE_MS, BUMP_NUDGE_TILES } from './sceneConstants'

/** Offset (in tiles) of the bump nudge `elapsedMs` into it: out and back along `dir`, zero when done. */
export function bumpNudgeOffset(dir: Direction, elapsedMs: number): { x: number, y: number } {
  if (elapsedMs < 0 || elapsedMs >= BUMP_NUDGE_MS) {
    return { x: 0, y: 0 }
  }
  const amount = Math.sin((Math.PI * elapsedMs) / BUMP_NUDGE_MS) * BUMP_NUDGE_TILES
  const delta = DIRECTION_DELTAS[dir]

  return { x: delta.x * amount, y: delta.y * amount }
}
