import { directionFromKey, swipeDirection } from '../../_shared/swipeInput'
import type { Direction, MoveIntent } from '../engine/types'

/**
 * Pure input plumbing for Chick's Challenge — no DOM here (see docs/games/chicks-challenge.md
 * "Controls"). Keyboard and touch sources both funnel into the same
 * MoveIntent queue so the engine is device-agnostic.
 *
 * The direction/threshold math is shared with other grid games via
 * `_shared/swipeInput.ts`; this module only adds what's specific to Chick's
 * Challenge — the `wait` intent and the capped FIFO queue. Touch detection,
 * the board-orientation remap, and repeat timing are intentionally not here:
 * `isTouchDevice` comes straight from the shared module, and the rotation
 * remap and repeat intervals live in `orientation.ts` / `ChicksGame.tsx`.
 */

/** Maps a `KeyboardEvent.key` to a move intent, or null when it isn't one. */
export function keyboardIntent(key: string): MoveIntent | null {
  if (key === ' ' || key === 'Spacebar') {
    return 'wait'
  }

  return directionFromKey(key)
}

/**
 * Maps a swipe gesture's delta to a step direction. Picks the dominant axis;
 * returns null when the gesture is shorter than `threshold` px.
 */
export function swipeIntent(dx: number, dy: number, threshold: number): Direction | null {
  return swipeDirection(dx, dy, threshold)
}

/** FIFO of pending MoveIntents, capped so fast input can't outrun the tween loop. */
export interface InputQueue {
  enqueue: (intent: MoveIntent) => void
  dequeue: () => MoveIntent | null
  clear: () => void
  readonly size: number
}

export function createInputQueue(maxSize: number): InputQueue {
  const items: MoveIntent[] = []

  return {
    enqueue(intent: MoveIntent): void {
      if (items.length >= maxSize) {
        return
      }
      items.push(intent)
    },
    dequeue(): MoveIntent | null {
      return items.shift() ?? null
    },
    clear(): void {
      items.length = 0
    },
    get size(): number {
      return items.length
    },
  }
}
