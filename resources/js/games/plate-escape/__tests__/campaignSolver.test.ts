import { remainingScrews, screwLock } from '../engine'
import { getLevel, LEVELS } from '../level'
import { analyseLevel } from './puzzleSolver'

// Chance that uniformly random legal play wins. These bands are authored
// difficulty targets; a level edit that leaves its band needs a deliberate retune.
const DIFFICULTY: Record<number, readonly [number, number]> = { 1: [1, 1], 2: [0.3, 0.65], 3: [0.15, 0.35], 4: [0.6, 0.95], 5: [0.3, 0.6] }
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
