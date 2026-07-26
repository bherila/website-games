/**
 * Device-agnostic directional input for grid games — pure, DOM-free helpers so
 * they can be unit tested without a browser.
 *
 * This generalises the swipe/keyboard mapping first written for Chick's
 * Challenge. That game's input queue (`chicks-challenge/input/inputQueue.ts`)
 * now builds on these primitives, layering on a `wait` intent, a capped FIFO
 * queue, and repeat timing; its board-orientation remap stays local to
 * `chicks-challenge/input/orientation.ts` and `ChicksGame.tsx`. New games
 * should use this module directly.
 */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

const KEY_TO_DIRECTION: Readonly<Record<string, SwipeDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
}

/** Maps a `KeyboardEvent.key` (arrows or WASD) to a direction, or null. */
export function directionFromKey(key: string): SwipeDirection | null {
  return KEY_TO_DIRECTION[key] ?? null
}

/**
 * Maps a pointer gesture's delta to a direction. Picks the dominant axis and
 * returns null while the gesture is shorter than `threshold` px, so a tap or a
 * jittery press never counts as a swipe.
 */
export function swipeDirection(dx: number, dy: number, threshold: number): SwipeDirection | null {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (Math.max(absX, absY) < threshold) {
    return null
  }

  if (absX > absY) {
    return dx > 0 ? 'right' : 'left'
  }

  return dy > 0 ? 'down' : 'up'
}

/** True on touch-capable devices — gates touch-only affordances and hints. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}
