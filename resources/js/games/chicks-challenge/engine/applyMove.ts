import { toDraft, toState } from './draft'
import { runMonsterPhase } from './monsters'
import { attemptStep, canStep, PLAYER, runSlideChain } from './movement'
import type { GameState, MoveIntent, MoveResult } from './types'

/**
 * The engine: one accepted input advances the whole world one step. Pure —
 * identical (state, intent) pairs always produce identical results. See
 * docs/games/chicks-challenge.md "Step model" for the normative resolution order.
 */
export function applyMove(state: GameState, intent: MoveIntent): MoveResult {
  if (!state.alive || state.won) {
    return { state, events: [], accepted: false }
  }

  const draft = toDraft(state)

  if (intent === 'wait') {
    draft.moves += 1
    draft.events.push({ type: 'waited' })
    runMonsterPhase(draft)

    return { state: toState(draft), events: draft.events, accepted: true }
  }

  if (!canStep(draft, PLAYER, intent)) {
    return {
      state,
      events: [{ type: 'bumped', at: state.player.pos, dir: intent }],
      accepted: false,
    }
  }

  draft.moves += 1
  attemptStep(draft, PLAYER, intent, false)
  runSlideChain(draft, PLAYER, intent)

  if (draft.alive && !draft.won) {
    runMonsterPhase(draft)
  }

  if (draft.won) {
    draft.events.push({ type: 'won', moves: draft.moves })
  }

  return { state: toState(draft), events: draft.events, accepted: true }
}
