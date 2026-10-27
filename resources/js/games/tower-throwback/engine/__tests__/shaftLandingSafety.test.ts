import type { EngineState, ShaftKind } from '../../gameTypes'
import { stepEngine } from '../engine'
import { validateDemolish, validatePlacement, validateShaftResize } from '../placement'
import { makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function stackedFloors(state: EngineState, top: number, skylobbies: readonly number[] = [], width = 30): void {
  for (let floor = 0; floor <= top; floor++) {
    place(state, skylobbies.includes(floor) ? 'skylobby' : 'slab', floor, 0, width)
  }
}

describe('express landing safety', () => {
  it('ignores a disconnected skylobby, then serves it when a bridge joins its floor segment', () => {
    const state = makeTestState()
    setStars(state, 4)
    for (let floor = 0; floor <= 10; floor++) {
      placeSlabRow(state, floor, 0, 19)
      place(state, floor === 5 ? 'skylobby' : 'slab', floor, 30, 20)
    }
    const id = placeShaft(state, 'express', 2, 0, 10)
    const shaft = state.shafts.find((candidate) => candidate.id === id)!
    expect(shaft.stops).toEqual([0, 10])

    place(state, 'skybridge', 5, 20, 10)
    expect(shaft.stops).toEqual([0, 5, 10])
    expect(shaft.enabledStops).toEqual([0, 5, 10])
  })

  it('keeps both endpoints with three skylobbies and rejects four instead of dropping the top', () => {
    const state = makeTestState()
    stackedFloors(state, 9, [5, 6, 7, 8])
    const command = { type: 'placeShaft', kind: 'express', x: 20, bottomFloor: 0, topFloor: 9 } as const
    expect(validatePlacement(state, command)).toEqual({ ok: false, reason: 'Express Elevator can serve at most 5 stops' })
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Express Elevator can serve at most 5 stops' }))
    expect(state.shafts).toHaveLength(0)

    const valid = makeTestState()
    stackedFloors(valid, 9, [5, 6, 7])
    placeShaft(valid, 'express', 20, 0, 9)
    expect(valid.shafts[0]!.stops).toEqual([0, 5, 6, 7, 9])
  })

  it('rejects a resize requiring a sixth landing without changing the existing shaft', () => {
    const state = makeTestState()
    stackedFloors(state, 10, [5, 6, 7, 9])
    const id = placeShaft(state, 'express', 20, 0, 8)
    const before = structuredClone(state.shafts[0])
    const command = { type: 'resizeShaft', shaftId: id, bottomFloor: 0, topFloor: 10 } as const
    expect(validateShaftResize(state, command)).toEqual({ ok: false, reason: 'Express Elevator can serve at most 5 stops' })
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Express Elevator can serve at most 5 stops' }))
    expect(state.shafts[0]).toEqual(before)
  })

  it('rejects a later top floor that would be a sixth landing', () => {
    const state = makeTestState()
    stackedFloors(state, 8, [5, 6, 7, 8])
    const id = placeShaft(state, 'express', 20, 0, 9)
    const shaft = state.shafts.find((candidate) => candidate.id === id)!
    expect(shaft.stops).toEqual([0, 5, 6, 7, 8])
    const before = state.units.length
    const command = { type: 'place', kind: 'slab', floor: 9, x: 0, widthTiles: 30 } as const
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Express Elevator can serve at most 5 stops' }))
    expect(state.units).toHaveLength(before)
    expect(shaft.stops).toEqual([0, 5, 6, 7, 8])
  })

  it('rejects a later skylobby that would add a sixth stop to an existing shaft', () => {
    const state = makeTestState()
    stackedFloors(state, 7, [5, 6, 7], 42)
    placeSlabRow(state, 8, 0, 29)
    placeSlabRow(state, 9, 0, 29)
    const id = placeShaft(state, 'express', 20, 0, 9)
    const shaft = state.shafts.find((candidate) => candidate.id === id)!
    const before = state.units.length
    const command = { type: 'place', kind: 'skylobby', floor: 8, x: 30, widthTiles: 12 } as const
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Express Elevator can serve at most 5 stops' }))
    expect(state.units).toHaveLength(before)
    expect(shaft.stops).toEqual([0, 5, 6, 7, 9])
  })

  it('rejects a bridge that would connect a sixth skylobby landing', () => {
    const state = makeTestState()
    setStars(state, 4)
    for (let floor = 0; floor <= 10; floor++) {
      place(state, [5, 6, 7].includes(floor) ? 'skylobby' : 'slab', floor, 0, 20)
      place(state, floor === 8 ? 'skylobby' : 'slab', floor, 30, 20)
    }
    const id = placeShaft(state, 'express', 2, 0, 10)
    const shaft = state.shafts.find((candidate) => candidate.id === id)!
    expect(shaft.stops).toEqual([0, 5, 6, 7, 10])
    const before = state.units.length
    const command = { type: 'place', kind: 'skybridge', floor: 8, x: 20, widthTiles: 10 } as const
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Express Elevator can serve at most 5 stops' }))
    expect(state.units).toHaveLength(before)
    expect(shaft.stops).toEqual([0, 5, 6, 7, 10])
  })
})

describe('landing support demolition', () => {
  it.each<ShaftKind>(['standard', 'service', 'express'])('requires shortening a %s elevator before demolishing its top landing floor', (kind) => {
    const state = makeTestState()
    stackedFloors(state, 3)
    const floor = state.units.find((candidate) => candidate.kind === 'slab' && candidate.floor === 3)!
    const id = placeShaft(state, kind, 20, 0, 3)
    const command = { type: 'demolishUnit', unitId: floor.id } as const
    expect(validateDemolish(state, command)).toEqual({ ok: false, reason: 'Shorten the elevator first' })
    expect(stepEngine(state, [command], 0)).toContainEqual(expect.objectContaining({ type: 'placementRejected', reason: 'Shorten the elevator first' }))
    expect(state.units).toContain(floor)
    expect(state.shafts[0]!.stops).toContain(3)

    stepEngine(state, [{ type: 'resizeShaft', shaftId: id, bottomFloor: 0, topFloor: 2 }], 0)
    expect(validateDemolish(state, command).ok).toBe(true)
    stepEngine(state, [command], 0)
    expect(state.units).not.toContain(floor)
  })

  it('protects disabled landings as well as enabled ones', () => {
    const state = makeTestState()
    stackedFloors(state, 3)
    const id = placeShaft(state, 'standard', 20, 0, 3)
    stepEngine(state, [{ type: 'setStopEnabled', shaftId: id, floor: 3, enabled: false }], 0)
    const floor = state.units.find((candidate) => candidate.floor === 3)!
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: floor.id })).toEqual({ ok: false, reason: 'Shorten the elevator first' })
  })

  it('allows demolishing an express crossing without a landing', () => {
    const state = makeTestState()
    stackedFloors(state, 2)
    placeShaft(state, 'express', 20, 0, 4)
    const floor = state.units.find((candidate) => candidate.floor === 2)!
    expect(state.shafts[0]!.stops).toEqual([0])
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: floor.id }).ok).toBe(true)
  })

  it('does not let an already unsupported legacy landing block unrelated demolition', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 10)
    for (let floor = 0; floor <= 3; floor++) placeSlabRow(state, floor, 30, 40)
    placeShaft(state, 'standard', 2, 0, 3)
    // An older save can already have a landing with no floor beneath it.
    state.shafts[0]!.stops.push(3)
    state.shafts[0]!.enabledStops.push(3)
    const distant = state.units.find((unit) => unit.floor === 3)!
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: distant.id }).ok).toBe(true)
  })

  it('protects the only glass landing support but allows removal when the other side still supports it', () => {
    const state = makeTestState()
    setStars(state, 4)
    for (let floor = 0; floor <= 3; floor++) placeSlabRow(state, floor, 0, 10)
    placeShaft(state, 'glass', 11, 0, 3)
    const floor = state.units.find((candidate) => candidate.floor === 3)!
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: floor.id })).toEqual({ ok: false, reason: 'Shorten the elevator first' })
    for (let level = 0; level <= 3; level++) placeSlabRow(state, level, 13, 20)
    expect(validateDemolish(state, { type: 'demolishUnit', unitId: floor.id }).ok).toBe(true)
  })
})
