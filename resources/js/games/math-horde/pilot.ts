import { applyGateOp, createGameState, GATE_SIDE_X, setTargetX, tickGame } from './gameEngine'
import type { GameState, LevelDef } from './gameTypes'

export const PILOT_TIME_LIMIT_SECONDS = 45

/**
 * Deterministic reference player: steers toward the gate side with the best
 * immediate outcome, otherwise toward the nearest live horde. Used by the
 * level generator to calibrate star thresholds and by tests to prove every
 * level stays winnable.
 */
export function steerPilot(state: GameState): void {
  const nextPair = state.gatePairs.find((gatePair) => !gatePair.resolved)
  if (nextPair && nextPair.z - state.progress <= 18) {
    const leftOutcome = applyGateOp(state.armySize, nextPair.left)
    const rightOutcome = applyGateOp(state.armySize, nextPair.right)
    setTargetX(state, leftOutcome >= rightOutcome ? -GATE_SIDE_X : GATE_SIDE_X)

    return
  }
  const nearestHorde = state.hordes
    .filter((horde) => horde.status === 'active' && horde.z - state.progress > 0)
    .sort((left, right) => left.z - right.z)[0]
  setTargetX(state, nearestHorde ? nearestHorde.x : 0)
}

export function runGreedyPilot(level: LevelDef): GameState {
  const state = createGameState(level)
  for (let frame = 0; frame < PILOT_TIME_LIMIT_SECONDS * 60 && state.status === 'playing'; frame += 1) {
    steerPilot(state)
    tickGame(state, 1 / 60)
    state.events.length = 0
  }

  return state
}
