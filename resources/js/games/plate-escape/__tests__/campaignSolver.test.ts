import { type PuzzleState, remainingScrews, screwLock } from '../engine'
import { getLevel, heldPlates, LEVELS } from '../level'
import { analyseLevel } from './puzzleSolver'

// Chance that uniformly random legal play wins. These bands are authored
// difficulty targets; a level edit that leaves its band needs a deliberate retune.
const DIFFICULTY: Record<number, readonly [number, number]> = {
  1: [1, 1], 2: [0.3, 0.65], 3: [0.15, 0.35], 4: [0.6, 0.95], 5: [0.3, 0.6],
  6: [0.5, 0.8], 7: [0.25, 0.45], 8: [0.25, 0.5], 9: [0.55, 0.85], 10: [0.12, 0.3],
}
const analyses = new Map(LEVELS.map((level) => [level.id, analyseLevel(level.id)]))

test.each(LEVELS.map((level) => level.id))('level %i is winnable from every opening with no soft-locks', (id) => {
  const analysis = analyses.get(id)!
  expect(analysis.softLocks).toBe(0)
  expect(analysis.win).toHaveLength(getLevel(id).screws.length)
  expect(analysis.randomWin).toBeGreaterThanOrEqual(DIFFICULTY[id]![0])
  expect(analysis.randomWin).toBeLessThanOrEqual(DIFFICULTY[id]![1])
  // Overflow is the only loss; the forgiving tutorial has none.
  expect(analysis.lose.length > 0).toBe(getLevel(id).overflowLoses)
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
  expect(shared.map((level) => level.id)).toEqual([6, 7, 8, 9, 10])
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
