import { bearingLock, hasWon, panelState, type PuzzleState, remainingScrews, screwLock } from '../engine'
import { getLevel, heldPlates, LEVELS } from '../level'
import { analyseLevel } from './puzzleSolver'

// Chance that uniformly random legal play wins. It counts tempting wrong taps rather than
// hidden commitments, so these bands are regression checks: a level edit that leaves its band
// needs a deliberate retune.
const DIFFICULTY: Record<number, readonly [number, number]> = {
  1: [1, 1], 2: [0.3, 0.65], 3: [0.15, 0.35], 4: [0.6, 0.95], 5: [0.3, 0.6],
  6: [0.5, 0.8], 7: [0.25, 0.45], 8: [0.25, 0.5], 9: [0.55, 0.85], 10: [0.12, 0.3],
  11: [0.45, 0.75], 12: [0.35, 0.6], 13: [0.22, 0.42], 14: [0.15, 0.32], 15: [0.1, 0.28],
}
/** Levels that introduce something: no move short of overflowing may doom the board. */
const TEACHING = new Set([1, 4, 6, 9, 11, 12])
/** Elsewhere a move may commit to a loss, but the overflow must show within this many removals. */
const DOOM_HORIZON = 4
const analyses = new Map(LEVELS.map((level) => [level.id, analyseLevel(level.id)]))

test.each(LEVELS.map((level) => level.id))('level %i has a winning order, no soft-locks and stays in its band', (id) => {
  const analysis = analyses.get(id)!
  expect(analysis.softLocks).toBe(0)
  expect(analysis.win).toHaveLength(getLevel(id).screws.length)
  expect(analysis.randomWin).toBeGreaterThanOrEqual(DIFFICULTY[id]![0])
  expect(analysis.randomWin).toBeLessThanOrEqual(DIFFICULTY[id]![1])
  // Overflow is the only loss; the forgiving tutorial has none.
  expect(analysis.lose.length > 0).toBe(getLevel(id).overflowLoses)
})

test.each(LEVELS.map((level) => level.id))('level %i can always be finished mechanically, and commits only within its rules', (id) => {
  const analysis = analyses.get(id)!
  // Whatever has been taken out, some order frees the rest given room to store it.
  expect(analysis.structuralDeadEnds.map((board) => board.removed)).toEqual([])
  if (TEACHING.has(id)) expect(analysis.doomed).toBe(0)
  else expect(analysis.doomDepth).toBeLessThanOrEqual(DOOM_HORIZON)
})

test('every legal order in the tutorial wins', () => {
  expect(analyses.get(1)!.randomWin).toBe(1)
  expect(analyses.get(1)!.boards.every((board) => board.overflow === null)).toBe(true)
})

test('no reachable board leaves a roof over a released gable wall', () => {
  for (const level of LEVELS) {
    const supported = level.plates.filter((plate) => plate.restsOn?.length)
    expect(supported.length).toBeGreaterThan(0)
    for (const board of analyses.get(level.id)!.boards) {
      for (const plate of supported) {
        if (remainingScrews(board, plate.id) === 0) continue
        for (const support of plate.restsOn!) expect(remainingScrews(board, support)).toBeGreaterThan(0)
      }
    }
  }
})

test('the bearing rule constrains every level rather than being satisfied by accident', () => {
  for (const level of LEVELS) {
    // Some reachable board has an uncovered head that only the roof holds in
    // place; without the rule, taking it would leave the reported floating roof.
    const constrained = analyses.get(level.id)!.boards.some((board) => board.overflow === null
      && level.screws.some((screw) => screwLock(board, screw)?.kind === 'bearing'))
    expect(constrained).toBe(true)
  }
})

test('shared screws shape every level that has them', () => {
  const shared = LEVELS.filter((level) => level.screws.some((screw) => screw.through))
  expect(shared.map((level) => level.id)).toEqual([6, 7, 8, 9, 10, 14, 15])
  for (const level of shared) {
    const boards = analyses.get(level.id)!.boards.filter((board) => board.overflow === null)
    // Some head is locked only because of a shared screw, so it would be free if every screw held
    // one plate: it is held through a plate it pins from behind, or its cover or load is now kept
    // in place only by other screws that pin it from behind.
    const pinnedFromBehind = (board: PuzzleState, plate: string): boolean => level.screws
      .filter((screw) => !board.removed.includes(screw.id) && heldPlates(screw).includes(plate))
      .every((screw) => screw.plate !== plate)
    expect(boards.some((board) => level.screws.some((screw) => {
      const lock = screwLock(board, screw)
      return lock !== null && ((lock.support ?? screw.plate) !== screw.plate || pinnedFromBehind(board, lock.plate))
    }))).toBe(true)
    // And some legal move lets two plates go at once.
    expect(boards.some((board) => level.screws.some((screw) => !board.removed.includes(screw.id) && !screwLock(board, screw)
      && heldPlates(screw).filter((plate) => remainingScrews(board, plate) === 1).length >= 2))).toBe(true)
  }
})

test('captive covers shape every level that has them', () => {
  const covered = LEVELS.filter((level) => level.screws.some((screw) => screw.coveredWhenOpen))
  expect(covered.map((level) => level.id)).toEqual([11, 12, 13, 14, 15])
  for (const level of covered) {
    const analysis = analyses.get(level.id)!
    // On a board that can still win, an open part is the only thing in the way of some head:
    // no closed cover is over it, and no part resting on its plate would hold it either.
    for (const cover of level.plates.filter((plate) => level.screws.some((screw) => screw.coveredWhenOpen?.includes(plate.id)))) {
      expect([cover.id, analysis.boards.some((board) => analysis.canWin(board) && !hasWon(board) && level.screws.some((screw) => {
        const lock = screwLock(board, screw)
        const held = heldPlates(screw)
        return lock?.kind === 'cover' && lock.plate === cover.id && panelState(board, cover.id) === 'open'
          && !(screw.blockedBy ?? []).some((id) => remainingScrews(board, id) > 0)
          && held.every((plate) => remainingScrews(board, plate) !== 1 || bearingLock(board, plate, held) === null)
      }))]).toEqual([cover.id, true])
    }
  }
})
