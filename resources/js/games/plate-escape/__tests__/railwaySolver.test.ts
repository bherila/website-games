import { bearingLock, createPuzzle, dialLock, hasWon, panelState, type PuzzleState, remainingScrews, removeScrew, screwLock, turnDial } from '../engine'
import { heldPlates, type Plate, type PuzzleLevel, type Screw } from '../level'
import { createRailwayLevels } from '../railwayLevels'
import { RAILWAY_TRACES } from './campaignFixtures'
import { analyseLevel, turnings } from './puzzleSolver'

/**
 * Each railway level, and copies of it with one mechanism taken away or
 * changed, registered under their own ids so the solver can compare them.
 */
const MUTANT = 1000
const mutants = new Map<number, PuzzleLevel>()
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  return { ...actual, getLevel: (id: number) => mutants.get(id) ?? actual.getLevel(id) }
})

const RAILWAY = createRailwayLevels()
const analyses = new Map(RAILWAY.map((level) => [level.id, analyseLevel(level.id)]))
const dialsOf = (level: PuzzleLevel): Plate[] => level.plates.filter((plate) => plate.dial)

/** Register a changed copy of a level and analyse it. */
function mutate(level: PuzzleLevel, change: (level: PuzzleLevel) => Pick<PuzzleLevel, 'plates' | 'screws'>, slot: number): ReturnType<typeof analyseLevel> {
  const id = MUTANT + level.id * 10 + slot
  mutants.set(id, { ...level, id, ...change(level) })
  return analyseLevel(id)
}

/** The same level with one dial lifted off: every head behind it shows. */
const withoutDial = (dial: string) => (level: PuzzleLevel): Pick<PuzzleLevel, 'plates' | 'screws'> => ({
  plates: level.plates.filter((plate) => plate.id !== dial),
  screws: level.screws.map((screw): Screw => {
    if (screw.underDial?.dial !== dial) return screw
    const { underDial: _gone, ...rest } = screw
    return rest
  }),
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

test('the railway runs from twelve screws in four colors to fifteen in five, every level with three spares', () => {
  expect(RAILWAY.map((level) => level.id)).toEqual([16, 17, 18, 19, 20])
  for (const level of RAILWAY) {
    const five = level.id >= 18
    expect([level.id, level.screws.length, level.trayColors.length, level.spareCapacity]).toEqual([level.id, five ? 15 : 12, five ? 5 : 4, 3])
    expect(level.trayColors.includes('pearl')).toBe(five)
    expect(level.plates.length).toBeLessThanOrEqual(12)
    // Every campaign dial is held by a stop pin, a screw on its own host, and none jams.
    for (const plate of dialsOf(level)) {
      expect(plate.dial!.jams).toBeUndefined()
      expect(plate.dial!.pins).toHaveLength(1)
      expect(level.screws.find((screw) => screw.id === plate.dial!.pins![0])!.plate).toBe(plate.host)
    }
  }
  expect(RAILWAY.map((level) => dialsOf(level).length)).toEqual([1, 1, 1, 2, 1])
})

test.each(RAILWAY_TRACES)('the authored trace for level $level wins, and its loss overflows on the last move', ({ level, win, lose }) => {
  expect(hasWon(play(createPuzzle(level), win))).toBe(true)
  expect(win.some((action) => action.startsWith('turn:'))).toBe(true)
  expect(play(createPuzzle(level), lose).overflow).not.toBeNull()
  expect(play(createPuzzle(level), lose.slice(0, -1)).overflow).toBeNull()
})

test.each(RAILWAY.map((level) => level.id))('level %i starts with every dial held by its stop pin', (id) => {
  const start = createPuzzle(id)
  const level = RAILWAY.find((candidate) => candidate.id === id)!
  for (const plate of dialsOf(level)) {
    expect(dialLock(start, plate.id)).toEqual({ kind: 'pin', screw: plate.dial!.pins![0] })
    // The pin is free to take from the start, so the dial is only ever waiting on the player.
    expect(screwLock(start, level.screws.find((screw) => screw.id === plate.dial!.pins![0])!)).toBeNull()
  }
  expect(turnings(start)).toHaveLength(1)
})

test.each(RAILWAY.flatMap((level) => dialsOf(level).map((plate) => [level.id, plate.id] as const)))('on level %i the %s is the only thing in the way of some head on a board that can still win', (id, dial) => {
  const level = RAILWAY.find((candidate) => candidate.id === id)!
  const analysis = analyses.get(id)!
  expect(analysis.boards.some((board) => analysis.canWin(board) && !hasWon(board) && level.screws.some((screw) => {
    if (screw.underDial?.dial !== dial || board.removed.includes(screw.id) || screwLock(board, screw)?.kind !== 'dial') return false
    // Shown, it would come straight out: no closed cover over it and no load on its plate.
    const held = heldPlates(screw)
    return !(screw.blockedBy ?? []).some((cover) => remainingScrews(board, cover) > 0)
      && held.every((plate) => remainingScrews(board, plate) !== 1 || bearingLock(board, plate, held) === null)
  }))).toBe(true)
})

test.each(RAILWAY.flatMap((level) => dialsOf(level).map((plate, slot) => [level.id, plate.id, slot] as const)))('on level %i, lifting the %s off changes the puzzle', (id, dial, slot) => {
  const level = RAILWAY.find((candidate) => candidate.id === id)!
  const real = analyses.get(id)!
  const open = mutate(level, withoutDial(dial), slot)
  // With the heads behind it always showing, random play wins noticeably more or less often, or a
  // different set of boards is already lost.
  expect({ odds: Math.abs(open.randomWin - real.randomWin) > 0.04, doomed: open.doomed !== real.doomed }).not.toEqual({ odds: false, doomed: false })
})

test('the music box\'s second window matters: with one window the odds change', () => {
  const level = RAILWAY.find((candidate) => candidate.id === 17)!
  const [tune] = dialsOf(level)
  expect(tune!.dial!.windows).toHaveLength(2)
  const single = mutate(level, (original) => ({
    plates: original.plates.map((plate) => plate.dial ? { ...plate, dial: { ...plate.dial, windows: plate.dial.windows.slice(0, 1) } } : plate),
    screws: original.screws,
  }), 5)
  expect(single.structuralDeadEnds).toEqual([])
  expect(Math.abs(single.randomWin - analyses.get(17)!.randomWin)).toBeGreaterThan(0.04)
})

test('a selector\'s turn moves only that selector, and the turn can be stepped back', () => {
  const level = RAILWAY.find((candidate) => candidate.id === 19)!
  const [front, side] = dialsOf(level)
  const unpinned = [front!, side!].reduce((state, plate) => removeScrew(state, plate.dial!.pins![0]!), createPuzzle(19))
  const turned = turnDial(unpinned, front!.id, 1)
  expect(turned.dials).toEqual({ [front!.id]: 1, [side!.id]: 0 })
  expect(turnDial(turned, side!.id, -1).dials).toEqual({ [front!.id]: 1, [side!.id]: 2 })
  // Turns never touch the board they came from, so an undo snapshot restores the dial exactly.
  expect(unpinned.dials).toEqual({ [front!.id]: 0, [side!.id]: 0 })
  expect(turnDial(turned, front!.id, -1).dials).toEqual(unpinned.dials)
})

test('which selector the signal box is worked from first decides whether it can still be won', () => {
  const level = RAILWAY.find((candidate) => candidate.id === 19)!
  const analysis = analyses.get(19)!
  const [front, side] = dialsOf(level).map((plate) => plate.id)
  const behind = (dial: string) => level.screws.filter((screw) => screw.underDial?.dial === dial)
  // Some winnable board offers a head behind each selector, and only one of the two keeps the win.
  expect(analysis.boards.some((board) => analysis.canWin(board) && !hasWon(board) && board.overflow === null && (() => {
    const outcome = (dial: string): boolean[] => behind(dial).filter((screw) => !board.removed.includes(screw.id) && !screwLock(board, screw))
      .map((screw) => analysis.canWin(removeScrew(board, screw.id)))
    const a = outcome(front!)
    const b = outcome(side!)
    return a.length > 0 && b.length > 0 && ((a.every(Boolean) && !b.some(Boolean)) || (b.every(Boolean) && !a.some(Boolean)))
  })())).toBe(true)
})

test('the locomotive can be started from the engine or the tender', () => {
  const level = RAILWAY.find((candidate) => candidate.id === 20)!
  const analysis = analyses.get(20)!
  const tender = new Set(['tender-near', 'tender-far', 'tender-back', 'bunker-rail', 'coal-hatch', 'tender-drawbar'])
  const start = createPuzzle(20)
  const firsts = level.screws.filter((screw) => !screwLock(start, screw)).map((screw) => ({ tender: tender.has(screw.plate), wins: analysis.canWin(removeScrew(start, screw.id)) }))
  expect(firsts.some((first) => first.tender && first.wins)).toBe(true)
  expect(firsts.some((first) => !first.tender && first.wins)).toBe(true)
  // The coupling pin waits for the tender's sides, which stand on its drawbar, and then frees both drawbars.
  const pin = level.screws.find((screw) => screw.id === 'coupling-pin')!
  expect(screwLock(start, pin)).toEqual({ kind: 'bearing', plate: 'tender-near', support: 'tender-drawbar' })
  const freed = removeScrew(['tender-near-1', 'tender-far-1'].reduce((state, id) => removeScrew(state, id), start), pin.id)
  expect(['engine-drawbar', 'tender-drawbar'].map((plate) => panelState(freed, plate))).toEqual(['gone', 'gone'])
})
