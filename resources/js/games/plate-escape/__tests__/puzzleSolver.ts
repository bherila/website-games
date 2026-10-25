import { createPuzzle, hasWon, type PuzzleState, removeScrew, screwLock } from '../engine'
import { getLevel } from '../level'

export interface LevelAnalysis {
  /** Distinct reachable boards, including overflow losses. */
  states: number
  /** Boards with screws left, no overflow, and no legal move. */
  softLocks: number
  /** Chance a player choosing uniformly among legal screws wins; a rough difficulty proxy. */
  randomWin: number
  /** Every reachable board, so tests can assert physical invariants over all of them. */
  boards: PuzzleState[]
  win: string[]
  lose: string[]
}

/**
 * Exhaustive search through the real engine. It assumes every head without a
 * cover can be reached by orbiting, so camera occlusion is checked separately
 * by the geometry tests and the browser journeys.
 */
export function analyseLevel(levelId: number, preferred: readonly string[] = []): LevelAnalysis {
  const level = getLevel(levelId)
  const rank = (id: string): number => {
    const index = preferred.indexOf(id)
    return index === -1 ? preferred.length + level.screws.findIndex((screw) => screw.id === id) : index
  }
  const ordered = [...level.screws].sort((a, b) => rank(a.id) - rank(b.id))
  const key = (state: PuzzleState): string => JSON.stringify([[...state.removed].sort(), state.trays, state.queue, [...state.spare].sort(), state.overflow])
  const memo = new Map<string, number>()
  const boards: PuzzleState[] = []
  let softLocks = 0
  const moves = (state: PuzzleState): PuzzleState[] => ordered
    .filter((screw) => !state.removed.includes(screw.id) && !screwLock(state, screw))
    .map((screw) => removeScrew(state, screw.id))
    .filter((next) => next !== state)
  const chance = (state: PuzzleState): number => {
    const id = key(state)
    const known = memo.get(id)
    if (known !== undefined) return known
    boards.push(state)
    let result = 0
    if (hasWon(state)) result = 1
    else if (state.overflow === null) {
      const next = moves(state)
      if (next.length === 0) softLocks++
      else result = next.reduce((sum, board) => sum + chance(board), 0) / next.length
    }
    memo.set(id, result)
    return result
  }
  const start = createPuzzle(levelId)
  const randomWin = chance(start)
  // Every successor was scored during the search, so a winning line follows positive scores.
  const win: string[] = []
  for (let state = start; !hasWon(state);) {
    const next = moves(state).find((board) => (memo.get(key(board)) ?? 0) > 0)
    if (!next) break
    win.push(next.removed.at(-1)!)
    state = next
  }
  return {
    states: memo.size, softLocks, randomWin, boards,
    win,
    lose: shortestLoss(start, moves),
  }
}

/** Breadth-first, so the authored overflow example is as short as possible. */
function shortestLoss(start: PuzzleState, moves: (state: PuzzleState) => PuzzleState[]): string[] {
  const queue: PuzzleState[] = [start]
  for (let index = 0; index < queue.length; index++) {
    const state = queue[index]!
    if (state.overflow !== null) return state.removed
    if (state.removed.length < 6) queue.push(...moves(state))
  }
  return []
}
