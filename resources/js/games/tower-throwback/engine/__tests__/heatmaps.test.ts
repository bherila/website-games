import { tileIndex } from '../grid'
import { congestionField, noiseField } from '../heatmaps'
import { evalBreakdown } from '../occupancy'
import { injectUnit, makeTestState, placeShaft, placeSlabRow } from './testState'

describe('noiseField', () => {
  it('matches the noise model at sampled tiles', () => {
    const state = makeTestState()
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 4, width: 12, storeys: 1 }) // level 12, radius 8
    const field = noiseField(state)

    expect(field[tileIndex(0, 4)]).toBeCloseTo(12) // inside the footprint, dist 0
    expect(field[tileIndex(0, 3)]).toBeCloseTo(12 * (1 - 1 / 8)) // 10.5
    expect(field[tileIndex(0, 19)]).toBeCloseTo(12 * (1 - 4 / 8)) // 6
    expect(field[tileIndex(0, 23)]).toBe(0) // dist 8 = radius → silent
    expect(field[tileIndex(1, 4)]).toBeCloseTo(6) // +/-1 floor -> x0.5
    expect(field[tileIndex(2, 4)]).toBeCloseTo(3) // +/-2 floors -> x0.25
    expect(field[tileIndex(3, 4)]).toBe(0) // beyond propagation
  })

  it('sums overlapping sources', () => {
    const state = makeTestState()
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1 })
    injectUnit(state, { kind: 'shop', floor: 0, x: 14, width: 8, storeys: 1 }) // level 6, radius 6
    const field = noiseField(state)
    // x=13: dist 2 from fastfood → 12×(6/8)=9; dist 1 from shop → 6×(5/6)=5.
    expect(field[tileIndex(0, 13)]).toBeCloseTo(9 + 5)
  })

  it('is consistent with the eval noise penalty (shared helper)', () => {
    const state = makeTestState()
    const apt = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 0, width: 4, storeys: 1 })
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 4, width: 12, storeys: 1 })
    const field = noiseField(state)
    // Single source: the unit's exposure equals the field at its nearest tile
    // (x=3), and the eval penalty is sensitivity × exposure.
    const breakdown = evalBreakdown(state, apt)
    expect(breakdown.noisePenalty).toBeCloseTo(2.0 * field[tileIndex(0, 3)]!)
  })
})

describe('congestionField', () => {
  it('spreads the nearest serving shaft wait across each segment', () => {
    const state = makeTestState()
    for (let f = 0; f <= 3; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    const id = placeShaft(state, 'standard', 10, 0, 3)
    state.shafts.find((s) => s.id === id)!.stats.avgWaitGameMin = 7

    const field = congestionField(state)
    expect(field[tileIndex(0, 0)]).toBeCloseTo(7)
    expect(field[tileIndex(3, 30)]).toBeCloseTo(7)
    expect(field[tileIndex(0, 31)]).toBe(0) // off the slab
    expect(field[tileIndex(5, 10)]).toBe(0) // no segment on that floor
  })

  it('picks the closer of two serving shafts per tile', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, 1, 0, 40)
    const a = placeShaft(state, 'standard', 2, 0, 1)
    const b = placeShaft(state, 'standard', 36, 0, 1)
    state.shafts.find((s) => s.id === a)!.stats.avgWaitGameMin = 4
    state.shafts.find((s) => s.id === b)!.stats.avgWaitGameMin = 9

    const field = congestionField(state)
    expect(field[tileIndex(0, 5)]).toBeCloseTo(4)
    expect(field[tileIndex(0, 34)]).toBeCloseTo(9)
  })

  it('is zero on floors without an enabled stop', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    for (let f = 1; f <= 4; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    const id = placeShaft(state, 'standard', 10, 0, 4)
    const shaft = state.shafts.find((s) => s.id === id)!
    shaft.stats.avgWaitGameMin = 5
    shaft.enabledStops = shaft.enabledStops.filter((f) => f !== 2)
    state.structureVersion += 1

    const field = congestionField(state)
    expect(field[tileIndex(1, 10)]).toBeCloseTo(5)
    expect(field[tileIndex(2, 10)]).toBe(0)
  })
})
