import type { Draft, DraftMonster } from './draft'
import type { Mover } from './movement'
import { attemptStep, canStep, runSlideChain } from './movement'
import type { Direction } from './types'
import { OPPOSITE_DIRECTION } from './types'

const LEFT_OF: Readonly<Record<Direction, Direction>> = {
  up: 'left',
  left: 'down',
  down: 'right',
  right: 'up',
}

const RIGHT_OF: Readonly<Record<Direction, Direction>> = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
}

/**
 * Each monster takes exactly one step (plus forced slides) in spawn order.
 * Clones spawned during this phase wait until the next move. Stops early if
 * the player dies.
 */
export function runMonsterPhase(draft: Draft): void {
  const idsAtPhaseStart = draft.monsters.map((monster) => monster.id)

  for (const id of idsAtPhaseStart) {
    if (!draft.alive || draft.won) {
      return
    }

    const monster = draft.monsters.find((candidate) => candidate.id === id)
    if (!monster) {
      continue
    }

    const dir = chooseDirection(draft, monster)
    if (!dir) {
      continue
    }

    const mover: Mover = { kind: 'monster', monster }
    if (attemptStep(draft, mover, dir, false)) {
      runSlideChain(draft, mover, dir)
    }
  }
}

/**
 * Deterministic per-kind AI (docs/games/chicks-challenge.md "Monsters"): bug keeps its
 * left hand on the wall, fireball prefers right turns, ball ping-pongs, tank
 * only ever drives forward.
 */
function chooseDirection(draft: Draft, monster: DraftMonster): Direction | null {
  const mover: Mover = { kind: 'monster', monster }
  const facing = monster.facing

  switch (monster.kind) {
    case 'bug':
      return firstOpenDirection(draft, mover, [LEFT_OF[facing], facing, RIGHT_OF[facing], OPPOSITE_DIRECTION[facing]])
    case 'fireball':
      return firstOpenDirection(draft, mover, [facing, RIGHT_OF[facing], LEFT_OF[facing], OPPOSITE_DIRECTION[facing]])
    case 'ball': {
      if (canStep(draft, mover, facing)) {
        return facing
      }

      const reversed = OPPOSITE_DIRECTION[facing]
      monster.facing = reversed

      return canStep(draft, mover, reversed) ? reversed : null
    }
    case 'tank':
      return canStep(draft, mover, facing) ? facing : null
  }
}

function firstOpenDirection(draft: Draft, mover: Mover, candidates: readonly Direction[]): Direction | null {
  for (const candidate of candidates) {
    if (canStep(draft, mover, candidate)) {
      return candidate
    }
  }

  return null
}
