import { createPuzzle, hasWon, type PuzzleState, removeScrew, screwLock, turnDial } from '../engine'
import { getLevel } from '../level'

export interface LevelAnalysis {
  /** Distinct reachable boards, including overflow losses. */
  states: number
  /** Boards with screws left, no overflow, and no legal move. */
  softLocks: number
  /** Chance a player choosing uniformly among legal screws wins; a regression check, not a difficulty target. */
  randomWin: number
  /** Every reachable board, including each dial stop between removals, so tests can assert physical invariants over all of them. */
  boards: PuzzleState[]
  /** A winning sequence of actions: screw ids, and dial turns written as `turn:<dial>:<1|-1>`. */
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

const key = (state: PuzzleState): string => JSON.stringify([[...state.removed].sort(), state.trays, state.queue, [...state.spare].sort(), state.overflow, state.dials])

/** A removal, with the dial turns that bring its head into view first. */
interface Step { next: PuzzleState, actions: string[] }

/** Every board reachable by turning dials alone, each with the turns that reach it, fewest first. */
export function turnings(state: PuzzleState): Step[] {
  const dials = Object.keys(state.dials)
  const found: Step[] = [{ next: state, actions: [] }]
  const seen = new Set([key(state)])
  for (let index = 0; index < found.length; index++) {
    const { next: board, actions } = found[index]!
    for (const dial of dials) {
      for (const step of [1, -1] as const) {
        const turned = turnDial(board, dial, step)
        if (turned === board || seen.has(key(turned))) continue
        seen.add(key(turned))
        found.push({ next: turned, actions: [...actions, `turn:${dial}:${step}`] })
      }
    }
  }
  return found
}

/**
 * Exhaustive search through the real engine. It assumes every head without a
 * cover can be reached by orbiting, so camera occlusion is checked separately
 * by the geometry tests and the browser journeys.
 *
 * Turning a dial is free and can cycle, so a move is a removal reached through
 * any number of turns: each screw counts once however many stops show it, and
 * adding empty stops leaves every score unchanged. Every move removes a screw,
 * so each search below terminates.
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
  const recorded = new Set<string>()
  const record = (state: PuzzleState): void => {
    if (recorded.has(key(state))) return
    recorded.add(key(state))
    boards.push(state)
  }
  let softLocks = 0
  const steps = (state: PuzzleState): Step[] => {
    const reachable = turnings(state)
    for (const { next } of reachable) record(next)
    return ordered.flatMap((screw) => {
      if (state.removed.includes(screw.id)) return []
      const view = reachable.find(({ next: board }) => !screwLock(board, screw))
      const next = view && removeScrew(view.next, screw.id)
      return next && next !== view.next ? [{ next, actions: [...view.actions, screw.id] }] : []
    })
  }
  const moves = (state: PuzzleState): PuzzleState[] => steps(state).map(({ next }) => next)
  const chance = (state: PuzzleState): number => {
    const id = key(state)
    const known = memo.get(id)
    if (known !== undefined) return known
    record(state)
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
  // Boards reached only by turning are scored too: each offers the same removals as the board it turned from.
  for (let index = 0; index < boards.length; index++) chance(boards[index]!)
  // Every successor was scored during the search, so a winning line follows positive scores.
  const winnable = (state: PuzzleState): boolean => (memo.get(key(state)) ?? 0) > 0
  const win: string[] = []
  for (let state = start; !hasWon(state);) {
    const step = steps(state).find(({ next }) => winnable(next))
    if (!step) break
    win.push(...step.actions)
    state = step.next
  }

  const live = boards.filter((board) => board.overflow === null && !hasWon(board))
  const finishable = structuralSearch()
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
    lose: shortestLoss(start, steps),
    structuralDeadEnds: live.filter((board) => !finishable(board)),
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
 * is unlimited. Locks depend only on which screws are out and where the dials
 * stand, so trays are ignored.
 */
function structuralSearch(): (board: PuzzleState) => boolean {
  const memo = new Map<string, boolean>()
  const finishable = (state: PuzzleState): boolean => {
    const level = getLevel(state.level)
    if (state.removed.length === level.screws.length) return true
    const id = JSON.stringify([[...state.removed].sort(), state.dials])
    const known = memo.get(id)
    if (known !== undefined) return known
    const board: PuzzleState = { ...createPuzzle(state.level), removed: state.removed, dials: state.dials }
    const result = turnings(board).some(({ next }) => level.screws.some((screw) => !next.removed.includes(screw.id) && !screwLock(next, screw)
      && finishable({ ...next, removed: [...next.removed, screw.id] })))
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

/** Breadth-first over distinct boards, so the authored overflow example has as few removals as possible. */
function shortestLoss(start: PuzzleState, steps: (state: PuzzleState) => Step[]): string[] {
  const queue: Step[] = [{ next: start, actions: [] }]
  const seen = new Set([key(start)])
  for (let index = 0; index < queue.length; index++) {
    const { next: state, actions } = queue[index]!
    if (state.overflow !== null) return actions
    for (const step of steps(state)) {
      const id = key(step.next)
      if (seen.has(id)) continue
      seen.add(id)
      queue.push({ next: step.next, actions: [...actions, ...step.actions] })
    }
  }
  return []
}
