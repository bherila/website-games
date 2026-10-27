import type { EngineState, Unit } from '../../gameTypes'
import { defaultShaftProgram, FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../../gameTypes'
import { shaftDef } from '../catalog'
import { getSegments, nearestShaftStopDistance, tileIndex } from '../grid'
import { noiseExposureAt } from '../heatmaps'
import { buildOccupancyIndex } from '../occupancy'
import { createRng } from '../rng'
import { geometryFor, oneDimensionalGeometry as geometry, type Segment,setTowerGeometry } from '../towerGeometry'
import { injectUnit, makeTestState } from './testState'

/** Independent baseline: enumerate covered cells, rather than reuse the seam's helpers. */
function cells(unit: Pick<Unit, 'x' | 'width'>): number[] {
  return Array.from({ length: unit.width }, (_, i) => unit.x + i)
}

function gap(a: Unit, b: Unit): number {
  return Math.min(...cells(a).flatMap((x) => cells(b).map((y) => Math.abs(x - y))))
}

function legacySegments(state: EngineState): Map<number, Segment[]> {
  const result = new Map<number, Segment[]>()
  for (let floor = FLOOR_MIN; floor <= FLOOR_MAX; floor++) {
    const covered = Array.from({ length: GRID_WIDTH }, (_, x) => x)
      .filter((x) => state.grid.slab[(floor - FLOOR_MIN) * GRID_WIDTH + x] === 1)
    for (const x of covered) {
      const runs = result.get(floor) ?? []
      const previous = runs.at(-1)
      if (previous && previous.x1 === x - 1) previous.x1 = x
      else runs.push({ floor, x0: x, x1: x })
      result.set(floor, runs)
    }
  }
  return result
}

function seededState(): EngineState {
  const state = makeTestState()
  const rng = createRng(90421)
  for (let i = 0; i < 72; i++) {
    injectUnit(state, {
      kind: i % 2 ? 'restroom' : 'restaurant', floor: Math.floor(rng.next() * 9) - 3,
      x: Math.floor(rng.next() * (GRID_WIDTH - 8)), width: 1 + Math.floor(rng.next() * 8),
      storeys: (1 + Math.floor(rng.next() * 3)) as 1 | 2 | 3,
    })
  }
  for (let i = 0; i < 16; i++) {
    state.shafts.push({
      id: 1000 + i, kind: i % 2 ? 'standard' : 'glass',
      x: Math.floor(rng.next() * (GRID_WIDTH - 4)), bottomFloor: -2, topFloor: 4,
      stops: [-2, -1, 0, 1, 2, 3, 4], enabledStops: [0, 2, 4], cars: [],
      program: defaultShaftProgram(), stats: { avgWaitGameMin: i, peakWaitGameMin: 0, dailyPeaksGameMin: [] },
    })
  }
  // Include isolated cells, disconnected segments, empty floors and boundary tiles.
  for (let floor = -2; floor <= 4; floor++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      state.grid.slab[tileIndex(floor, x)] = rng.next() < 0.72 ? 1 : 0
    }
  }
  return state
}

describe('one-dimensional TowerGeometry', () => {
  it('matches legacy geometry over seeded units, slabs and physical/enabled shaft stops', () => {
    const state = seededState()
    const expectedSegments = legacySegments(state)
    expect(geometry.segments(state)).toEqual(expectedSegments)
    expect(geometry.segments(state, false)).toEqual(expectedSegments)
    const rng = createRng(60123)
    for (let i = 0; i < 300; i++) {
      const a = state.units[Math.floor(rng.next() * state.units.length)]!
      const b = state.units[Math.floor(rng.next() * state.units.length)]!
      const expectedGap = gap(a, b)
      expect(geometry.distance(a, b)).toBe(expectedGap)
      expect(geometry.adjacent(a, b, 6)).toBe(
        a.floor === b.floor ? expectedGap <= 6 : Math.abs(a.floor - b.floor) === 1 && expectedGap === 0,
      )
      expect([...geometry.footprintCells(a)]).toEqual(
        Array.from({ length: a.storeys }, (_, n) => a.floor + n)
          .flatMap((floor) => cells(a).map((x) => ({ floor, x }))),
      )
      const segment = expectedSegments.get(a.floor)?.find((s) => a.x >= s.x0 && a.x <= s.x1) ?? null
      expect(geometry.segmentOf(state, a.floor, a.x)).toEqual(segment)
      const sameSegment = state.units.filter((other) => other.floor === a.floor && segment &&
        cells(other).every((x) => x >= segment.x0 && x <= segment.x1))
      expect(geometry.nearestOnSegment(state, a, state.units)).toBe(
        segment ? Math.min(...sameSegment.map((other) => gap(a, other))) : Infinity,
      )
      for (const enabledOnly of [false, true]) {
        const serving = state.shafts.filter((shaft) =>
          (enabledOnly ? shaft.enabledStops : shaft.stops).includes(a.floor) && segment &&
          Array.from({ length: shaftDef(shaft.kind).width }, (_, n) => shaft.x + n)
            .some((x) => x >= segment.x0 && x <= segment.x1))
        const distances = serving.flatMap((shaft) =>
          Array.from({ length: shaftDef(shaft.kind).width }, (_, n) => Math.abs(a.x - shaft.x - n)))
        expect(geometry.nearestStop(state, a.floor, a.x, { enabledOnly })).toBe(Math.min(...distances))
      }
    }
  })

  it('preserves continuous walking distances bit for bit', () => {
    const rng = createRng(987)
    for (let i = 0; i < 300; i++) {
      const a = rng.next() * GRID_WIDTH
      const b = rng.next() * GRID_WIDTH
      expect(geometry.distance({ x: a }, { x: b })).toBe(Math.abs(a - b))
    }
  })

  it('keeps floor buckets live, query results memoized, and nearby sources in id order', () => {
    const state = seededState()
    const index = geometry.createUnitIndex()
    for (const unit of state.units) index.add(unit)
    for (let floor = -4; floor <= 5; floor++) {
      expect(index.byFloor.get(floor) ?? []).toEqual(state.units.filter((unit) => unit.floor === floor))
      for (const reach of [0, 2, 6]) {
        const actual = index.near(floor, reach)
        expect(actual).toEqual(state.units.filter((unit) => Math.abs(unit.floor - floor) <= reach))
        expect(index.near(floor, reach)).toBe(actual)
      }
    }
    state.units[0]!.offline = true
    expect(index.byFloor.get(state.units[0]!.floor)?.[0]).toBe(state.units[0])
    const last = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 1, storeys: 1 })
    index.add(last)
    expect(index.near(0, 0).at(-1)).toBe(last)
  })

  it('preserves fire edge adjacency even for overlapping or multi-storey fixture units', () => {
    const state = seededState()
    for (const floor of [-2, 0, 4]) {
      const sources = state.units.filter((unit) => unit.id % 3 === 0)
      // The old fire helper tests the outer edge against either candidate endpoint.
      const expected = state.units.filter((candidate) => candidate.floor === floor && sources.some((source) =>
        source.floor === floor && [source.x - 1, source.x + source.width]
          .some((edge) => edge === candidate.x || edge === candidate.x + candidate.width - 1)))
      expect(geometry.touchingNeighbors(sources, state.units, floor)).toEqual(expected)
    }
  })

  it('retains structure-version invalidation and fresh segment extraction', () => {
    const state = makeTestState()
    state.grid.slab[tileIndex(0, 3)] = 1
    const first = geometry.segments(state)
    state.grid.slab[tileIndex(0, 4)] = 1
    expect(geometry.segments(state)).toBe(first)
    expect(geometry.segments(state, false).get(0)).toEqual([{ floor: 0, x0: 3, x1: 4 }])
    state.structureVersion++
    expect(geometry.segments(state)).not.toBe(first)
    expect(geometry.segmentOf(state, 0, 4)).toEqual({ floor: 0, x0: 3, x1: 4 })
  })

  it('uses a per-state implementation through engine consumers without adding save fields', () => {
    const state = seededState()
    const savedKeys = Object.keys(state)
    const distance = jest.fn(geometry.distance)
    const createUnitIndex = jest.fn(geometry.createUnitIndex)
    const nearestStop = jest.fn(() => 17)
    const segments = jest.fn(geometry.segments)
    const custom = { ...geometry, distance, createUnitIndex, nearestStop, segments }
    setTowerGeometry(state, custom)
    expect(geometryFor(state)).toBe(custom)
    expect(geometryFor(makeTestState())).toBe(geometry)
    expect(getSegments(state)).toEqual(legacySegments(state))
    expect(segments).toHaveBeenCalledWith(state)
    expect(nearestShaftStopDistance(state, 0, 0)).toBe(17)
    buildOccupancyIndex(state)
    expect(createUnitIndex).toHaveBeenCalledTimes(4)
    noiseExposureAt(state, 0, 0, 10)
    expect(distance).toHaveBeenCalled()
    expect(Object.keys(state)).toEqual(savedKeys)
  })
})
