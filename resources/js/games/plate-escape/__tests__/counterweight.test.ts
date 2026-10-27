import * as THREE from 'three'

import { cordAnchor, cordLength, cordPoints } from '../counterweight'
import { createPuzzle, freedPlates, panelState, type PuzzleState, removeScrew, screwLock } from '../engine'
import { plateQuaternion } from '../houseGeometry'
import { getLevel, LEVELS, type Plate, type PuzzleLevel, type Screw } from '../level'
import { RAIL_SECONDS, railPose } from '../plateMotion'
import { analyseLevel } from './puzzleSolver'

const BOARD = 905
const CUT = 906
const LOOP = 907

/**
 * A case with a weight on its front whose cord lifts a door over one of the
 * case's own screws, so the case cannot leave until the weight has dropped.
 * The cut-cord copy keeps the door shut until its host goes; the loop has the
 * door over the weight's own screw.
 */
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  const panel = (id: string, extra: Partial<Plate> = {}): Plate => ({ id, name: id, position: [0, 0, 0], size: [1, 1], normal: [0, 0, 1], up: [0, 1, 0], finish: 'guard', color: '#ccc', ...extra })
  const pad = (color: Screw['color'], count: number): Screw[] => Array.from({ length: count }, (_, index) => ({ id: `pad-${color}-${index}`, plate: 'pad', color, position: [0, 0] }))
  const board = (id: number, door: Partial<Plate>, weightBlockedBy?: string[]): PuzzleLevel => ({
    id, name: 'Counterweight', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'],
    plates: [
      panel('case'), panel('roof', { restsOn: ['case'] }), panel('pad'),
      panel('weight', { rail: { along: [0, -1, 0], travel: 0.6 }, host: 'case', finish: 'weight' }),
      panel('door', { rail: { along: [0, 1, 0], travel: 0.6 }, host: 'case', ...door }),
    ],
    screws: [
      { id: 'under', plate: 'case', color: 'coral', position: [0, 0], blockedBy: ['door'] },
      { id: 'case-1', plate: 'case', color: 'mint', position: [0, 0] },
      { id: 'weight-1', plate: 'weight', color: 'blue', position: [0, 0], ...(weightBlockedBy ? { blockedBy: weightBlockedBy } : {}) },
      { id: 'roof-1', plate: 'roof', color: 'amber', position: [0, 0] },
      ...pad('coral', 2), ...pad('mint', 2), ...pad('blue', 2), ...pad('amber', 2),
    ],
  })
  const LEVELS = [...actual.LEVELS, board(905, { drivenBy: 'weight' }), board(906, { drivenBy: 'case' }), board(907, { drivenBy: 'weight' }, ['door'])]
  return { ...actual, LEVELS, getLevel: (id: number) => LEVELS.find((level) => level.id === id) ?? actual.getLevel(id) }
})

const screw = (level: number, id: string): Screw => getLevel(level).screws.find((candidate) => candidate.id === id)!
const take = (level: number, ids: readonly string[]): PuzzleState => ids.reduce((state, id) => {
  const next = removeScrew(state, id)
  expect([id, next]).not.toEqual([id, state])
  return next
}, createPuzzle(level))

test('a part a counterweight drives stays shut while the weight is held, and opens once it drops', () => {
  const start = createPuzzle(BOARD)
  expect(panelState(start, 'weight')).toBe('pinned')
  expect(panelState(start, 'door')).toBe('pinned')
  expect(screwLock(start, screw(BOARD, 'under'))).toEqual({ kind: 'cover', plate: 'door' })
  expect(removeScrew(start, 'under')).toBe(start)
  const dropped = take(BOARD, ['weight-1'])
  // The weight hangs at the end of its cord on the case; the door has opened, covering nothing.
  expect(panelState(dropped, 'weight')).toBe('open')
  expect(panelState(dropped, 'door')).toBe('open')
  expect(screwLock(dropped, screw(BOARD, 'under'))).toBeNull()
})

test('the driven part\'s position is derived from the screws taken, so undo and replay need nothing else', () => {
  const before = take(BOARD, ['roof-1'])
  const after = removeScrew(before, 'weight-1')
  expect(Object.keys(after).sort()).toEqual(Object.keys(createPuzzle(BOARD)).sort())
  // Undo restores the earlier snapshot, and with it the shut door; nothing else was stored.
  expect(panelState(before, 'door')).toBe('pinned')
  expect(panelState(after, 'door')).toBe('open')
  // Any board with the same screws out has the door in the same place, whatever the order.
  const reordered = take(BOARD, ['weight-1', 'roof-1'])
  expect(reordered.removed.sort()).toEqual(after.removed.sort())
  expect(panelState(reordered, 'door')).toBe(panelState(after, 'door'))
})

test('a driven part has no screws, bears on nothing, and counts as released when it leaves with its host', () => {
  const level = getLevel(BOARD)
  expect(level.screws.some((candidate) => candidate.plate === 'door')).toBe(false)
  expect(freedPlates(createPuzzle(BOARD))).toBe(0)
  // The dropped weight hangs free of screws, so it counts; the open door does not until the case goes.
  const dropped = take(BOARD, ['weight-1'])
  expect(freedPlates(dropped)).toBe(1)
  // The case's last screw waits only for the roof resting on it, never for the door or the weight.
  const held = take(BOARD, ['weight-1', 'under'])
  expect(screwLock(held, screw(BOARD, 'case-1'))).toEqual({ kind: 'bearing', plate: 'roof', support: 'case' })
  const gone = take(BOARD, ['weight-1', 'under', 'roof-1', 'case-1'])
  expect(panelState(gone, 'door')).toBe('gone')
  expect(panelState(gone, 'weight')).toBe('gone')
  expect(freedPlates(gone)).toBe(level.plates.filter((plate) => plate.id !== 'pad').length)
})

test('cutting the cord leaves the part shut until its host goes, which cannot happen while it covers a screw holding that host', () => {
  const linked = analyseLevel(BOARD)
  expect(linked.structuralDeadEnds).toEqual([])
  expect(linked.win.indexOf('weight-1')).toBeLessThan(linked.win.indexOf('under'))
  const cut = analyseLevel(CUT)
  expect(cut.structuralDeadEnds.some((board) => board.removed.length === 0)).toBe(true)
  expect(cut.win).toEqual([])
})

test('a cord that would have to open its own weight is a loop, and the structural gate rejects it', () => {
  const loop = analyseLevel(LOOP)
  expect(screwLock(createPuzzle(LOOP), screw(LOOP, 'weight-1'))).toEqual({ kind: 'cover', plate: 'door' })
  expect(loop.structuralDeadEnds.some((board) => board.removed.length === 0)).toBe(true)
  expect(cordLoops(getLevel(LOOP))).toEqual(['door'])
  expect(cordLoops(getLevel(BOARD))).toEqual([])
})

/**
 * Parts on a loop of "must move first" links: a cover before the plates its
 * heads hold, and a weight before the part its cord drives.
 */
function cordLoops(level: PuzzleLevel): string[] {
  const after = new Map<string, Set<string>>()
  const link = (from: string, to: string): void => { after.set(from, (after.get(from) ?? new Set()).add(to)) }
  for (const candidate of level.screws) {
    for (const cover of candidate.blockedBy ?? []) for (const plate of [candidate.plate, ...candidate.through ?? []]) link(cover, plate)
  }
  for (const plate of level.plates) if (plate.drivenBy) link(plate.drivenBy, plate.id)
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => [...after.get(from) ?? []].some((next) => next === target || (!seen.has(next) && seen.add(next) && reaches(next, target, seen)))
  return level.plates.filter((plate) => plate.drivenBy && reaches(plate.id, plate.id)).map((plate) => plate.id)
}

test('every campaign counterweight is authored the same way, and no level\'s covers and cords form a loop', () => {
  for (const level of LEVELS.filter((candidate) => candidate.id < 900)) {
    expect([level.id, cordLoops(level)]).toEqual([level.id, []])
    for (const driven of level.plates.filter((plate) => plate.drivenBy)) {
      const weight = level.plates.find((plate) => plate.id === driven.drivenBy)!
      // The driven part has no screws and moves on a hinge or a rail; it hangs on the weight's host.
      expect(level.screws.some((candidate) => candidate.plate === driven.id || candidate.through?.includes(driven.id))).toBe(false)
      expect(Boolean(driven.hinge) !== Boolean(driven.rail)).toBe(true)
      expect(driven.host).toBe(weight.host)
      // The weight is held by screws of its own and drops straight down its cord.
      expect(level.screws.some((candidate) => candidate.plate === weight.id)).toBe(true)
      expect(weight.rail!.along[1]).toBeLessThan(-0.99)
      // A counterweight only opens access: nothing lands on a head when the cord pulls.
      expect(level.screws.filter((candidate) => candidate.coveredWhenOpen?.some((id) => id === driven.id || id === weight.id))).toEqual([])
    }
  }
})

test('the cord is tied where the part moves: the top of a weight, a hinged part\'s free edge, a slider\'s leading edge', () => {
  const frame = new THREE.Quaternion()
  const weight: Plate = { id: 'w', name: 'w', position: [0, 0, 0], size: [0.6, 0.8], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1 }, host: 'h', finish: 'weight', color: '#000' }
  expect(cordAnchor(weight, frame).toArray()).toEqual([0, 0.4, 0])
  const { rail: _rail, ...unrailed } = weight
  const door: Plate = { ...weight, drivenBy: 'w', rail: { along: [-1, 0, 0], travel: 1 } }
  expect(cordAnchor(door, frame).toArray()).toEqual([-0.3, 0, 0])
  expect(cordAnchor({ ...unrailed, drivenBy: 'w', hinge: 'left' }, frame).toArray()).toEqual([0.3, 0, 0])
  expect(cordAnchor({ ...unrailed, drivenBy: 'w', hinge: 'bottom' }, frame).toArray()).toEqual([0, 0.4, 0])
})

test('a sash-like cord stays taut: the weight drops as far as the part it drives rises', () => {
  const weight: Plate = { id: 'w', name: 'w', position: [-1, -0.5, 0.3], size: [0.6, 0.8], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 0.6 }, host: 'h', finish: 'weight', color: '#000' }
  const door: Plate = { ...weight, id: 'd', position: [0, 0, 0.3], drivenBy: 'w', rail: { along: [0, 1, 0], travel: 0.6 }, cord: [[-1, 1.2, 0.3], [0, 1.2, 0.3]] }
  const frames = { driven: plateQuaternion(door), weight: plateQuaternion(weight) }
  const at = (plate: Plate, t: number) => railPose(plate, new THREE.Vector3().fromArray(plate.position), plateQuaternion(plate), t)
  const lengths = [0, RAIL_SECONDS / 2, RAIL_SECONDS].map((t) => cordLength(cordPoints(door, weight, at(door, t), at(weight, t), frames)))
  for (const length of lengths) expect(length).toBeCloseTo(lengths[0]!, 6)
})
