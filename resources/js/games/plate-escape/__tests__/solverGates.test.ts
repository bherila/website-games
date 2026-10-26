import type { Plate, PuzzleLevel, Screw } from '../level'
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
  const LEVELS = [...actual.LEVELS, trap]
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
