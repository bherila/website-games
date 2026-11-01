import { createPuzzle, hasWon, type PuzzleState, removeScrew, turnDial } from '../engine'
import { LAB_DIAL_JAM, LAB_DIAL_PIN } from '../labLevels'
import { labLevelFromSearch } from '../labLevels'
import { LAB_LEVELS } from '../level'
import { LAB_TRACES } from './campaignFixtures'
import { analyseLevel, turnings } from './puzzleSolver'

const analyses = new Map(LAB_LEVELS.map((level) => [level.id, analyseLevel(level.id)]))

test.each([LAB_DIAL_PIN, LAB_DIAL_JAM])('lab board %i always finishes, never dooms, and its winning order replays through the engine', (id) => {
  const analysis = analyses.get(id)!
  expect(analysis.softLocks).toBe(0)
  expect(analysis.structuralDeadEnds).toEqual([])
  // A board for learning a mechanism keeps the teaching guarantee.
  expect(analysis.doomed).toBe(0)
  expect(analysis.randomWin).toBeGreaterThan(0.5)
  expect(analysis.randomWin).toBeLessThan(0.8)
  expect(hasWon(play(createPuzzle(id), analysis.win))).toBe(true)
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

test.each(LAB_TRACES)('the authored lab trace for $lab wins, and its loss overflows on the last move', ({ level, lab, win, lose }) => {
  expect(labLevelFromSearch(`?lab=${lab}`)).toBe(level)
  expect(hasWon(play(createPuzzle(level), win))).toBe(true)
  const lost = play(createPuzzle(level), lose)
  expect(lost.overflow).not.toBeNull()
  expect(play(createPuzzle(level), lose.slice(0, -1)).overflow).toBeNull()
})

test('boards reached only by turning are searched and scored like any other', () => {
  const analysis = analyses.get(LAB_DIAL_PIN)!
  const turned = analysis.boards.filter((board) => board.dials.dial !== 0)
  expect(turned.length).toBeGreaterThan(0)
  // Once the pin is out the dial turns both ways, so every stop of a board shares its outcome.
  for (const board of turned) {
    for (const { next } of turnings(board)) expect(analysis.canWin(next)).toBe(analysis.canWin(board))
  }
})

test('the stop rule decides how far the dial can wander between removals', () => {
  const free = analyses.get(LAB_DIAL_PIN)!.boards.find((board) => board.removed.length === 1 && board.removed[0] === 'door-pin')!
  expect(turnings(free).map(({ next }) => next.dials.dial).sort((a, b) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER))).toEqual([0, 1, 2, 3])
  // A jamming dial with a head in its window does not move at all.
  const jammed = analyses.get(LAB_DIAL_JAM)!.boards[0]!
  expect(turnings(jammed)).toHaveLength(1)
})

test('only a lab board\'s own link name opens it', () => {
  for (const search of ['', '?lab=', '?lab=dial', '?lab=constructor', '?lab=toString', '?lab=__proto__', '?lab=hasOwnProperty']) expect(labLevelFromSearch(search)).toBeNull()
})
