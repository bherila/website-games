import type { GameState } from '../engine/types'

/**
 * True when waiting can ever change a level: a wait only runs the monster
 * phase (engine/applyMove.ts), so it matters only on a board that starts with
 * monsters or can clone them. Everywhere else a wait is a wasted move — and on
 * a phone the likeliest one, since the D-pad's centre and a tap on the board
 * both mean "wait". The UI drops wait intents on such levels; the engine and
 * the solver are unchanged (the solver never profits from a no-op wait).
 */
export function levelUsesWait(start: GameState): boolean {
  return start.monsters.length > 0 || Object.keys(start.cloneLinks).length > 0
}
