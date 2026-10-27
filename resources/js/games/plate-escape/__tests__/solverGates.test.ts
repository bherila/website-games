import { LEVELS, type Plate, type PuzzleLevel, type Screw } from '../level'
import { analyseLevel } from './puzzleSolver'

const TRAP = 900

/**
 * A support whose cover is pinned through it. Take the support's own screw first and the shared
 * screw becomes its last, held by the load resting on it, while the load's screw waits behind
 * the cover that shared screw still pins: a mechanical dead end, though another order wins.
 */
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  const panel = (id: string, extra: Partial<Plate> = {}): Plate => ({ id, name: id, position: [0, 0, 0], size: [1, 1], normal: [0, 0, 1], up: [0, 1, 0], finish: 'side', color: '#ccc', ...extra })
  const pad = (color: Screw['color'], count: number): Screw[] => Array.from({ length: count }, (_, index) => ({ id: `pad-${color}-${index}`, plate: 'pad', color, position: [0, 0] }))
  const trap: PuzzleLevel = {
    id: 900, name: 'Trap', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'],
    plates: [panel('cover'), panel('support'), panel('load', { restsOn: ['support'] }), panel('pad')],
    screws: [
      { id: 'shared', plate: 'cover', through: ['support'], color: 'coral', position: [0, 0] },
      { id: 'support-1', plate: 'support', color: 'mint', position: [0, 0] },
      { id: 'load-1', plate: 'load', color: 'blue', position: [0, 0], blockedBy: ['cover'] },
      ...pad('coral', 2), ...pad('mint', 2), ...pad('blue', 2), ...pad('amber', 3),
    ],
  }
  // A jamming dial on a support, its window starting over the support's last screw, which the load
  // still bears on. The load's own screw waits at the dial's other stop, which the jammed dial
  // cannot reach, and the dial stays as long as the support does.
  const deadlock = (id: number, jams: boolean): PuzzleLevel => ({
    id, name: 'Deadlock', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'],
    plates: [
      panel('base'), panel('support'), panel('load', { restsOn: ['support'] }), panel('pad'),
      panel('dial', { host: 'support', finish: 'dial', dial: { stops: 2, windows: [0], windowRadius: 0.5, jams } }),
    ],
    screws: [
      { id: 'held', plate: 'support', color: 'coral', position: [0, 0], underDial: { dial: 'dial', slot: 0 } },
      { id: 'load-1', plate: 'load', color: 'mint', position: [0, 0], underDial: { dial: 'dial', slot: 1 } },
      { id: 'base-1', plate: 'base', color: 'blue', position: [0, 0] },
      ...pad('coral', 2), ...pad('mint', 2), ...pad('blue', 2), ...pad('amber', 3),
    ],
  })
  // Each counterweight's cord cut in turn: the part it drove stays shut until its host comes off.
  const cut = actual.LEVELS.flatMap((level) => level.plates.filter((plate) => plate.drivenBy).map((driven, index): PuzzleLevel => ({
    ...level, id: 10_000 + level.id * 10 + index, name: `${level.name} (${driven.id} cut)`,
    plates: level.plates.map((plate) => plate === driven ? { ...plate, drivenBy: plate.host! } : plate),
  })))
  const LEVELS = [...actual.LEVELS, trap, deadlock(903, true), deadlock(904, false), ...cut]
  return { ...actual, LEVELS, getLevel: (id: number) => LEVELS.find((level) => level.id === id) ?? actual.getLevel(id) }
})

const trap = analyseLevel(TRAP)

test('a mechanical dead end hidden behind a later overflow fails the structural gate', () => {
  // The old checks pass it: a winning order exists and no board is left without a move.
  expect(trap.win).toHaveLength(12)
  expect(trap.softLocks).toBe(0)
  // But taking the support's own screw first can never be undone by any amount of storage.
  expect(trap.structuralDeadEnds.length).toBeGreaterThan(0)
  expect(trap.structuralDeadEnds.every((board) => board.removed.includes('support-1') && !board.removed.includes('shared'))).toBe(true)
})

test('commitment measures see the trap that random play hides', () => {
  expect(trap.doomed).toBeGreaterThan(0)
  // The doomed board lets several more screws come out before the overflow shows.
  expect(trap.doomDepth).toBeGreaterThan(3)
  expect(trap.worstSafeShare).toBeLessThan(1)
  expect(trap.simplePolicyWin).toBeLessThan(1)
  expect(trap.minSpares).toBeLessThanOrEqual(2)
  expect(trap.lose.length).toBeGreaterThan(0)
})

test('a jamming dial that can lock against the bearing rule fails the structural gate from the start', () => {
  const jammed = analyseLevel(903)
  // The head in the window is held by the load, and the dial will not turn while it shows.
  expect(jammed.structuralDeadEnds.some((board) => board.removed.length === 0)).toBe(true)
  expect(jammed.win).toEqual([])
  // The same board with a dial that turns freely can always be finished, turning to free the load first.
  const free = analyseLevel(904)
  expect(free.structuralDeadEnds).toEqual([])
  expect(free.win.indexOf('turn:dial:1')).toBeLessThan(free.win.indexOf('load-1'))
  expect(free.win.indexOf('load-1')).toBeLessThan(free.win.indexOf('held'))
})

test('cutting any counterweight\'s cord leaves its part shut over a screw its host needs: the level can no longer be finished', () => {
  const cut = LEVELS.filter((level) => level.id >= 10_000)
  // Lift Cage has two cords; every other clockworks level has one.
  expect(cut.map((level) => level.id)).toEqual([10_210, 10_220, 10_221, 10_230, 10_240, 10_250])
  for (const level of cut) {
    const analysis = analyseLevel(level.id)
    expect([level.name, analysis.win]).toEqual([level.name, []])
    expect(analysis.structuralDeadEnds.some((board) => board.removed.length === 0)).toBe(true)
  }
})
