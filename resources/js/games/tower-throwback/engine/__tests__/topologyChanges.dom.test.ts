import { loadSandbox, restoreSandbox, saveSandbox } from '../../gameProgress'
import type { EngineState, Person } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { stepEngine } from '../engine'
import { spawnPerson, stepPeople } from '../people'
import { makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function tower(top = 3): EngineState {
  const state = makeTestState()
  for (let floor = 0; floor <= top; floor += 1) placeSlabRow(state, floor, 0, 40)
  return state
}

function travel(state: EngineState, minutes = 3): void {
  for (let elapsed = 0; elapsed < minutes; elapsed += 0.05) {
    stepElevators(state, 0.05, [])
    stepPeople(state, 0.05, [])
  }
}

function board(state: EngineState, person: Person): void {
  for (let attempt = 0; attempt < 100 && person.state !== 'riding'; attempt += 1) {
    stepElevators(state, 0.01, [])
    stepPeople(state, 0.01, [])
  }
  expect(person.state).toBe('riding')
}

function disable(state: EngineState, shaftId: number, floor: number): void {
  expect(stepEngine(state, [{ type: 'setStopEnabled', shaftId, floor, enabled: false }], 0)).not.toContainEqual(
    expect.objectContaining({ type: 'placementRejected' }),
  )
}

function assertNoRosters(state: EngineState): void {
  const ids = new Set(state.people.map((person) => person.id))
  for (const shaft of state.shafts) for (const car of shaft.cars) {
    expect(car.passengerIds.every((id) => ids.has(id))).toBe(true)
  }
}

beforeEach(() => localStorage.clear())

describe('closing elevator landings', () => {
  it.each(['queued', 'walking', 'riding'] as const)('replans a %s rider onto an alternate while leaving unrelated journeys intact', (phase) => {
    const state = tower()
    const closedId = placeShaft(state, 'standard', 10, 0, 3)
    const backupId = placeShaft(state, 'standard', 30, 0, 3)
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: phase === 'walking' ? 0 : 10, toFloor: 1, toX: 10, purpose: 'shopping' })!
    expect(person.legs.some((leg) => leg.shaftId === closedId)).toBe(true)
    if (phase === 'riding') board(state, person)
    else expect(person.state).toBe(phase)
    const unrelated = spawnPerson(state, { tier: 'med', floor: 2, x: 0, toFloor: 2, toX: 5, purpose: 'shopping' })!
    const unaffected = JSON.stringify(unrelated)
    const rng = state.rng.state()

    disable(state, closedId, 1)

    expect(state.rng.state()).toBe(rng)
    expect(JSON.stringify(unrelated)).toBe(unaffected)
    expect(person.legs.some((leg) => leg.shaftId === backupId)).toBe(true)
    expect(person.legs.some((leg) => leg.shaftId === closedId && (leg.fromFloor === 1 || leg.toFloor === 1))).toBe(false)
    travel(state, 5)
    expect(person.floor).toBe(1)
    expect(state.people).toHaveLength(0)
    assertNoRosters(state)
  })

  it.each(['queued', 'walking', 'riding'] as const)('abandons a stranded %s journey and releases every car reference', (phase) => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 3)
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: phase === 'walking' ? 0 : 10, toFloor: 1, toX: 10, purpose: 'shopping' })!
    if (phase === 'riding') board(state, person)
    disable(state, shaftId, 1)
    expect(state.people).toHaveLength(0)
    expect(person.floor).not.toBe(1)
    assertNoRosters(state)
    travel(state)
    expect(state.people).toHaveLength(0)
  })

  it.each([true, false])('preserves a current transfer ride while repairing its tail (alternate=%s)', (alternate) => {
    const state = tower(5)
    const carrierId = placeShaft(state, 'standard', 10, 0, 2)
    const closedId = placeShaft(state, 'standard', 20, 2, 5)
    const backupId = alternate ? placeShaft(state, 'standard', 30, 2, 5) : null
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 5, toX: 20, purpose: 'shopping' })!
    expect(person.legs.some((leg) => leg.shaftId === closedId)).toBe(true)
    board(state, person)
    const current = { ...person.legs[person.legIndex]! }
    const carrier = state.shafts.find((shaft) => shaft.id === carrierId)!
    disable(state, closedId, 5)
    if (alternate) {
      expect(person.state).toBe('riding')
      expect(person.legs[person.legIndex]).toEqual(current)
      expect(carrier.cars[0]!.passengerIds).toContain(person.id)
      expect(person.legs.some((leg) => leg.shaftId === backupId)).toBe(true)
      travel(state, 8)
      expect(person.floor).toBe(5)
    } else {
      expect(state.people).toHaveLength(0)
      expect(carrier.cars[0]!.passengerIds).not.toContain(person.id)
    }
    assertNoRosters(state)
  })

  it('keeps unaffected passengers in the same car while an invalid ride is abandoned', () => {
    const state = tower()
    const shaftId = placeShaft(state, 'standard', 10, 0, 3)
    const affected = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 1, toX: 10, purpose: 'shopping' })!
    const healthy = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 3, toX: 10, purpose: 'shopping' })!
    board(state, affected)
    expect(healthy.state).toBe('riding')
    const legs = JSON.stringify(healthy.legs)
    disable(state, shaftId, 1)
    expect(state.people.map((person) => person.id)).toEqual([healthy.id])
    expect(state.shafts[0]!.cars[0]!.passengerIds).toEqual([healthy.id])
    expect(JSON.stringify(healthy.legs)).toBe(legs)
    travel(state, 5)
    expect(healthy.floor).toBe(3)
    assertNoRosters(state)
  })

  it('keeps simultaneous reroutes stable and resumes the same movement after saving', () => {
    const state = tower()
    const closed = placeShaft(state, 'standard', 10, 0, 3)
    placeShaft(state, 'standard', 20, 0, 3)
    placeShaft(state, 'standard', 30, 0, 3)
    for (let i = 0; i < 6; i += 1) {
      spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 1, toX: 10, purpose: 'shopping' })
    }
    disable(state, closed, 1)
    const ids = state.people.map((person) => person.id)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    const saved = loadSandbox('slot-a')
    expect(saved).not.toBeNull()
    const resumed = restoreSandbox(saved!)
    travel(state, 8)
    travel(resumed, 8)
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    expect(saveSandbox(resumed, 'slot-b')).toEqual({ ok: true })
    expect(loadSandbox('slot-b')).toEqual(loadSandbox('slot-a'))
    assertNoRosters(resumed)
  })
})

describe('removing walking connectors', () => {
  it.each(['stairs', 'escalator'] as const)('replans a removed %s with an alternate and abandons without one', (kind) => {
    for (const alternate of [false, true]) {
      const state = tower(1)
      setStars(state, 2)
      const removedId = place(state, kind, 0, 5)
      const backupId = alternate ? placeShaft(state, 'standard', 30, 0, 1) : null
      const person = spawnPerson(state, { tier: 'med', floor: 0, x: 5, toFloor: 1, toX: 5, purpose: 'shopping' })!
      expect(person.legs[0]!.type).toBe(kind)
      stepPeople(state, 0.1, []) // already partway up the connector
      expect(person.floor).toBeGreaterThan(0)
      const rng = state.rng.state()
      stepEngine(state, [{ type: 'demolishUnit', unitId: removedId }], 0)
      expect(state.units.some((unit) => unit.id === removedId)).toBe(false)
      expect(state.rng.state()).toBe(rng)
      if (alternate) {
        expect(person.floor).toBe(0)
        expect(person.legs.some((leg) => leg.shaftId === backupId)).toBe(true)
        travel(state, 5)
        expect(person.floor).toBe(1)
      } else expect(state.people).toHaveLength(0)
      assertNoRosters(state)
    }
  })

  it.each([false, true])('repairs a removed stair tail without disturbing the current elevator (alternate=%s)', (alternate) => {
    const state = tower(2)
    const carrierId = placeShaft(state, 'standard', 10, 0, 1)
    const stairsId = place(state, 'stairs', 1, 20)
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 2, toX: 20, purpose: 'shopping' })!
    expect(person.legs.some((leg) => leg.type === 'stairs')).toBe(true)
    board(state, person)
    const current = { ...person.legs[person.legIndex]! }
    const backup = alternate ? placeShaft(state, 'standard', 30, 1, 2) : null
    stepEngine(state, [{ type: 'demolishUnit', unitId: stairsId }], 0)
    if (alternate) {
      expect(person.state).toBe('riding')
      expect(person.legs[person.legIndex]).toEqual(current)
      expect(person.legs.some((leg) => leg.shaftId === backup)).toBe(true)
      expect(saveSandbox(state)).toEqual({ ok: true })
      expect(loadSandbox()).not.toBeNull()
      travel(state, 5)
      expect(person.floor).toBe(2)
    } else {
      expect(state.people).toHaveLength(0)
      expect(state.shafts.find((shaft) => shaft.id === carrierId)!.cars[0]!.passengerIds).toEqual([])
    }
    assertNoRosters(state)
  })

  it('leaves a walker who has already crossed the removed bridge completely unchanged', () => {
    const state = makeTestState()
    setStars(state, 4)
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, 1, 0, 9)
    placeSlabRow(state, 1, 20, 29)
    const bridge = place(state, 'skybridge', 1, 10, 10)
    const person = spawnPerson(state, { tier: 'med', floor: 1, x: 0, toFloor: 1, toX: 29, purpose: 'shopping' })!
    stepPeople(state, 0.4, [])
    expect(person.x).toBe(24)
    const before = JSON.stringify(person)
    stepEngine(state, [{ type: 'demolishUnit', unitId: bridge }], 0)
    expect(JSON.stringify(person)).toBe(before)
    travel(state)
    expect(person.x).toBe(29)
  })

  it.each([false, true])('invalidates a removed bridge walk but preserves an unrelated bank journey (alternate=%s)', (alternate) => {
    const state = makeTestState()
    setStars(state, 4)
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, 1, 0, 9)
    placeSlabRow(state, 1, 20, 29)
    const bridgeId = place(state, 'skybridge', 1, 10, 10)
    if (alternate) {
      place(state, 'stairs', 0, 5)
      place(state, 'stairs', 0, 25)
    }
    const walker = spawnPerson(state, { tier: 'med', floor: 1, x: 0, toFloor: 1, toX: 29, purpose: 'shopping' })!
    const unrelated = spawnPerson(state, { tier: 'med', floor: 1, x: 20, toFloor: 1, toX: 29, purpose: 'shopping' })!
    const unaffected = JSON.stringify(unrelated)
    stepEngine(state, [{ type: 'demolishUnit', unitId: bridgeId }], 0)
    expect(JSON.stringify(unrelated)).toBe(unaffected)
    if (alternate) {
      expect(walker.legs.some((leg) => leg.type === 'stairs')).toBe(true)
      travel(state, 5)
      expect(walker.floor).toBe(1)
      expect(walker.x).toBe(29)
    } else expect(state.people.map((person) => person.id)).toEqual([unrelated.id])
    assertNoRosters(state)
  })
})
