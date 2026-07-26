import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../../gameTypes'
import { createGridLayers, getSegments, nearestShaftStopDistance, rebuildGrid, selectableAt, shaftIdAt, slabAt, tileIndex, unitIdAt } from '../grid'
import { makeTestState, place, placeShaft, placeSlabRow } from './testState'

describe('tileIndex bounds', () => {
  it('maps the bottom-left tile to 0 and steps by row width', () => {
    expect(tileIndex(FLOOR_MIN, 0)).toBe(0)
    expect(tileIndex(FLOOR_MIN, 5)).toBe(5)
    expect(tileIndex(FLOOR_MIN + 1, 0)).toBe(GRID_WIDTH)
  })

  it('throws outside the grid', () => {
    expect(() => tileIndex(FLOOR_MIN - 1, 0)).toThrow(RangeError)
    expect(() => tileIndex(FLOOR_MAX + 1, 0)).toThrow(RangeError)
    expect(() => tileIndex(0, -1)).toThrow(RangeError)
    expect(() => tileIndex(0, GRID_WIDTH)).toThrow(RangeError)
  })
})

describe('rebuildGrid', () => {
  it('repopulates slab and unit layers from entities and bumps structureVersion', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 9)
    const officeId = place(state, 'officeS', 0, 0)

    expect(slabAt(state, 0, 0)).toBe(true)
    expect(slabAt(state, 0, 9)).toBe(true)
    expect(slabAt(state, 0, 10)).toBe(false)
    // Non-slab units live in the unit layer, not the slab layer.
    expect(unitIdAt(state, 0, 0)).toBe(officeId + 1)
    expect(state.structureVersion).toBeGreaterThan(0)

    // A hand-mutated entity list plus rebuild reproduces the same layers.
    const rebuilt = makeTestState({ units: state.units, structureVersion: 1 })
    rebuildGrid(rebuilt)
    expect(unitIdAt(rebuilt, 0, 0)).toBe(officeId + 1)
    expect(slabAt(rebuilt, 0, 5)).toBe(true)
  })
})

describe('floorSegments', () => {
  it('returns one segment for a single contiguous tower', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 9)
    const runs = getSegments(state).get(0)
    expect(runs).toEqual([{ floor: 0, x0: 0, x1: 9 }])
  })

  it('splits twin towers into separate segments', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 4)
    placeSlabRow(state, 0, 10, 14)
    const runs = getSegments(state).get(0)
    expect(runs).toEqual([
      { floor: 0, x0: 0, x1: 4 },
      { floor: 0, x0: 10, x1: 14 },
    ])
  })

  it('a skybridge on another floor does not merge the lobby-floor segments', () => {
    const state = makeTestState({ star: 4, maxStarReached: 4 })
    for (const [x0, x1] of [[0, 4], [10, 14]] as const) {
      for (let f = 0; f <= 2; f++) {
        placeSlabRow(state, f, x0, x1)
      }
    }
    place(state, 'skybridge', 2, 5, 5) // spans the gap on floor 2, ends land on both towers
    // Floor 0 (the lobbies) is untouched by the bridge above → still two segments.
    expect(getSegments(state).get(0)).toHaveLength(2)
  })
})

describe('nearestShaftStopDistance', () => {
  it('measures tile gap to the nearest same-segment stop, Infinity when absent', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 20)
    placeShaft(state, 'standard', 10, 0, 5)

    expect(nearestShaftStopDistance(state, 0, 10)).toBe(0)
    expect(nearestShaftStopDistance(state, 0, 5)).toBe(5)
    expect(nearestShaftStopDistance(state, 0, 13)).toBe(2)
    // Floor 3 has no landing (only floor 0 is slabbed within the shaft span).
    expect(nearestShaftStopDistance(state, 3, 10)).toBe(Infinity)
  })
})

describe('createGridLayers', () => {
  it('sizes each layer to the full grid', () => {
    const layers = createGridLayers()
    expect(layers.slab.length).toBe(layers.unit.length)
    expect(layers.shaft.length).toBe(layers.unit.length)
    expect(shaftIdAt(makeTestState(), 0, 0)).toBe(0)
  })
})

describe('selectableAt (review fix #14)', () => {
  it('resolves shaft > unit > slab-owner in priority order', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    const officeId = place(state, 'officeS', 0, 0)
    const shaftId = placeShaft(state, 'standard', 20, 0, 1)

    const shaftPick = selectableAt(state, 0, 20)
    expect(shaftPick).toMatchObject({ type: 'shaft', shaft: { id: shaftId } })
    const unitPick = selectableAt(state, 0, 2)
    expect(unitPick).toMatchObject({ type: 'unit', unit: { id: officeId } })
    // Bare floor: the slab-family OWNER — previously unselectable.
    const slabPick = selectableAt(state, 0, 10)
    expect(slabPick).toMatchObject({ type: 'unit', unit: { kind: 'slab' } })
    expect(selectableAt(state, 5, 10)).toBeNull() // empty sky
  })
})
