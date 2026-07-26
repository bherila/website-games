import type { EngineEvent, GameState } from './engine/types'

export const TOTAL_LEVELS = 40

export const GAME_TITLE = "Chick's Challenge"
export const GAME_EMOJI = '🐥'

export const PROGRESS_STORAGE_KEY = 'bwh.chicks-challenge.progress.v1'

/** Tween duration for a normal step; forced slides run faster and chain. */
export const STEP_TWEEN_MS = 110
export const SLIDE_TWEEN_MS = 70
/** Auto-repeat cadence while a key/direction is held. */
export const INPUT_REPEAT_MS = 150
/** Max queued intents so fast play stays responsive without skipping. */
export const INPUT_BUFFER_MAX = 2

export type GamePhase = 'select' | 'playing' | 'won' | 'dead'

/**
 * Stars from the winning run's move count vs the level's par:
 * 3 within 10% over par, 2 within 50%, otherwise 1.
 */
export function starsForMoves(moves: number, par: number): number {
  if (moves <= Math.ceil(par * 1.1)) {
    return 3
  }

  if (moves <= Math.ceil(par * 1.5)) {
    return 2
  }

  return 1
}

/**
 * Contract between ChicksGame (engine owner) and ChicksScene (renderer).
 * moveSeq increments once per accepted move; the scene consumes that move's
 * events exactly once and may accelerate playback when it falls behind.
 */
export interface SceneProps {
  state: GameState
  events: readonly EngineEvent[]
  moveSeq: number
}
