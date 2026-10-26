import { createPuzzle, hasWon, type PuzzleState, removeScrew, screwLock } from '../engine'
import { getLevel } from '../level'

export interface LevelAnalysis {
  /** Distinct reachable boards, including overflow losses. */
  states: number
  /** Boards with screws left, no overflow, and no legal move. */
  softLocks: number
  /** Chance a player choosing uniformly among legal screws wins; a regression check, not a difficulty target. */
  randomWin: number
  /** Every reachable board, so tests can assert physical invariants over all of them. */
  boards: PuzzleState[]
  win: string[]
  lose: string[]
  /** Boards short of overflow that could not be finished even with unlimited storage: a mechanical trap. */
  structuralDeadEnds: PuzzleState[]
  /** Boards short of overflow from which no order wins: a commitment the player has already made. */
  doomed: number
  /** The most removals a doomed board can still take before its loss shows. */
  doomDepth: number
  /** Chance of winning by collecting into an open tray when possible, otherwise any move that does not overflow. */
  simplePolicyWin: number
  /** Over winnable boards, the smallest share of non-overflow moves that keep a win. */
  worstSafeShare: number
  /** The fewest spare slots any winning order fills at once. */
  minSpares: number
  /** Whether some order still wins from a reachable board. */
  canWin: (board: PuzzleState) => boolean
}

const key = (state: PuzzleState): string => JSON.stringify([[...state.removed].sort(), state.trays, state.queue, [...state.spare].sort(), state.overflow])

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
  const winnable = (state: PuzzleState): boolean => (memo.get(key(state)) ?? 0) > 0
  const win: string[] = []
  for (let state = start; !hasWon(state);) {
    const next = moves(state).find(winnable)
    if (!next) break
    win.push(next.removed.at(-1)!)
    state = next
  }

  const live = boards.filter((board) => board.overflow === null && !hasWon(board))
  const finishable = structuralSearch(levelId)
  const doomedBoards = live.filter((board) => !winnable(board))
  const depth = new Map<string, number>()
  const doomDepthOf = (state: PuzzleState): number => {
    const id = key(state)
    const known = depth.get(id)
    if (known !== undefined) return known
    const result = state.overflow === null ? Math.max(0, ...moves(state).map((next) => 1 + doomDepthOf(next))) : 0
    depth.set(id, result)
    return result
  }

  return {
    states: memo.size, softLocks, randomWin, boards,
    win,
    lose: shortestLoss(start, moves),
    structuralDeadEnds: live.filter((board) => !finishable(board.removed)),
    doomed: doomedBoards.length,
    doomDepth: Math.max(0, ...doomedBoards.map(doomDepthOf)),
    simplePolicyWin: simplePolicy(start, moves),
    worstSafeShare: Math.min(1, ...live.filter(winnable).map((board) => {
      const safe = moves(board).filter((next) => next.overflow === null)
      return safe.filter((next) => hasWon(next) || winnable(next)).length / safe.length
    })),
    minSpares: fewestSpares(start, moves),
    canWin: (board) => hasWon(board) || winnable(board),
  }
}

/**
 * Whether every remaining screw can still come out in some order when storage
 * is unlimited. Locks depend only on which screws are out, so trays are ignored.
 */
function structuralSearch(levelId: number): (removed: readonly string[]) => boolean {
  const level = getLevel(levelId)
  const memo = new Map<string, boolean>()
  const finishable = (removed: readonly string[]): boolean => {
    if (removed.length === level.screws.length) return true
    const id = [...removed].sort().join()
    const known = memo.get(id)
    if (known !== undefined) return known
    const board = { ...createPuzzle(levelId), removed: [...removed] }
    const result = level.screws.some((screw) => !removed.includes(screw.id) && !screwLock(board, screw) && finishable([...removed, screw.id]))
    memo.set(id, result)
    return result
  }
  return finishable
}

/** Collect into an open tray when possible; otherwise choose uniformly among moves that do not overflow. */
function simplePolicy(start: PuzzleState, moves: (state: PuzzleState) => PuzzleState[]): number {
  const memo = new Map<string, number>()
  const chance = (state: PuzzleState): number => {
    const id = key(state)
    const known = memo.get(id)
    if (known !== undefined) return known
    let result = 0
    if (hasWon(state)) result = 1
    else if (state.overflow === null) {
      const safe = moves(state).filter((next) => next.overflow === null)
      const collected = safe.filter((next) => next.spare.length <= state.spare.length)
      const pool = collected.length ? collected : safe
      result = pool.length ? pool.reduce((sum, next) => sum + chance(next), 0) / pool.length : 0
    }
    memo.set(id, result)
    return result
  }
  return chance(start)
}

/** The fewest spare slots a winning order ever fills at once; Infinity when none wins. */
function fewestSpares(start: PuzzleState, moves: (state: PuzzleState) => PuzzleState[]): number {
  const memo = new Map<string, number>()
  const need = (state: PuzzleState): number => {
    const id = key(state)
    const known = memo.get(id)
    if (known !== undefined) return known
    let result = Infinity
    if (hasWon(state)) result = state.spare.length
    else if (state.overflow === null) result = Math.min(Infinity, ...moves(state).map((next) => Math.max(state.spare.length, need(next))))
    memo.set(id, result)
    return result
  }
  return need(start)
}

/** Breadth-first over distinct boards, so the authored overflow example is as short as possible. */
function shortestLoss(start: PuzzleState, moves: (state: PuzzleState) => PuzzleState[]): string[] {
  const queue: PuzzleState[] = [start]
  const seen = new Set([key(start)])
  for (let index = 0; index < queue.length; index++) {
    const state = queue[index]!
    if (state.overflow !== null) return state.removed
    for (const next of moves(state)) {
      const id = key(next)
      if (seen.has(id)) continue
      seen.add(id)
      queue.push(next)
    }
  }
  return []
}
