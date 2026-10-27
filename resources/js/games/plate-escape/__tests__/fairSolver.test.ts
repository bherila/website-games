import { createPuzzle, hasWon, type PuzzleState, rackOpen, removeScrew, spareCapacity, turnDial } from '../engine'
import { createFairLevels } from '../fairLevels'
import { getLevel, type PuzzleLevel } from '../level'
import { FAIR_TRACES } from './campaignFixtures'
import { analyseLevel } from './puzzleSolver'

/** The same board with its staging rack taken away, so its third slot never opens. */
const WITHOUT_RACK = 1000

/** The fair's levels, whether or not the campaign lists them yet, and each one without its rack. */
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  const fair = jest.requireActual<typeof import('../fairLevels')>('../fairLevels').createFairLevels()
  const unracked = fair.map(({ rack: _rack, ...level }): PuzzleLevel => ({ ...level, id: level.id + 1000 }))
  const extra = [...fair, ...unracked]
  return { ...actual, getLevel: (id: number) => actual.LEVELS.find((level) => level.id === id) ?? extra.find((level) => level.id === id) ?? actual.getLevel(id) }
})

const FAIR = createFairLevels().map((level) => level.id)
/** Teaching levels may not doom a board; elsewhere a doomed board must show its loss within this many removals. */
const DOOM_HORIZON = 4
const analyses = new Map(FAIR.map((id) => [id, { rack: analyseLevel(id), without: analyseLevel(id + WITHOUT_RACK) }]))

test('every fair level names a staging rack that starts shut, behind a cover painted with its mark', () => {
  expect(FAIR).toEqual([26, 27, 28, 29, 30])
  for (const id of FAIR) {
    const level = getLevel(id)
    const cover = level.plates.find((plate) => plate.id === level.rack)!
    expect(cover.finish).toBe('rack-door')
    expect(level.screws.some((screw) => screw.plate === cover.id)).toBe(true)
    expect([id, level.spareCapacity, level.trayColors.length, level.screws.length]).toEqual([id, 2, 5, 15])
    // At most twelve removable panels; a dial is not one.
    expect(level.plates.filter((plate) => !plate.dial).length).toBeLessThanOrEqual(12)
    expect(rackOpen(createPuzzle(id))).toBe(false)
    expect(spareCapacity(createPuzzle(id))).toBe(2)
  }
})

test.each(FAIR)('level %i is sound with its rack: a winning order, no soft-locks and no mechanical traps', (id) => {
  const { rack } = analyses.get(id)!
  expect(rack.softLocks).toBe(0)
  expect(rack.structuralDeadEnds).toEqual([])
  expect(rack.win.filter((action) => !action.startsWith('turn:'))).toHaveLength(15)
  // Storage never holds more than the capacity its own board derives, and the rack's slot gets used.
  for (const board of rack.boards) expect(board.spare.length).toBeLessThanOrEqual(spareCapacity(board))
  expect(rack.boards.some((board) => board.spare.length === 3 && board.overflow === null)).toBe(true)
})

test.each(FAIR)('the rack matters on level %i: without its slot more boards doom, a doom hides longer, and random play wins far less', (id) => {
  const { rack, without } = analyses.get(id)!
  expect(without.doomed).toBeGreaterThan(rack.doomed)
  // Taking the rack away lets a doomed board run on past the horizon the campaign allows.
  expect(without.doomDepth).toBeGreaterThan(DOOM_HORIZON)
  expect(rack.doomDepth).toBeLessThanOrEqual(DOOM_HORIZON)
  expect(without.randomWin).toBeLessThan(rack.randomWin * 0.6)
})

test('the carousel teaches the rack: no move dooms the board while the rack can still open, and without it some do', () => {
  const { rack, without } = analyses.get(26)!
  expect(rack.doomed).toBe(0)
  expect(without.doomed).toBeGreaterThan(0)
  // Collecting whenever a tray is open always wins with the rack, and only a third of the time without it.
  expect(rack.simplePolicyWin).toBe(1)
  expect(without.simplePolicyWin).toBeLessThan(0.5)
})

/** Every action must be accepted: a refused turn or tap fails the trace. */
function play(start: PuzzleState, actions: readonly string[]): PuzzleState {
  return actions.reduce((state, action) => {
    const [kind, dial, step] = action.split(':')
    const next = kind === 'turn' ? turnDial(state, dial!, Number(step) as 1 | -1) : removeScrew(state, action)
    expect([action, next]).not.toEqual([action, state])
    return next
  }, start)
}

test.each(FAIR_TRACES)('the authored trace for level $level wins without a spare overflowing, and its loss overflows on the last move', ({ level, win, lose }) => {
  const boards = [createPuzzle(level)]
  for (const action of win) boards.push(play(boards.at(-1)!, [action]))
  expect(hasWon(boards.at(-1)!)).toBe(true)
  expect(boards.every((board) => board.overflow === null)).toBe(true)
  // Each win frees the rack along the way.
  expect(boards.some((board) => rackOpen(board))).toBe(true)
  const before = play(createPuzzle(level), lose.slice(0, -1))
  expect(before.overflow).toBeNull()
  expect(before.spare).toHaveLength(spareCapacity(before))
  expect(play(before, lose.slice(-1)).overflow).not.toBeNull()
})
