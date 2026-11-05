import { loadSandbox, restoreSandbox, saveSandbox } from '../../gameProgress'
import type { EngineState, Unit } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { stepEngine } from '../engine'
import { repairUnit, respondToFire } from '../incidents'
import { occupancyPass } from '../occupancy'
import { claimStall, functionalStalls, rampServedFloors, snapshotParkingRuntime } from '../parking'
import { spawnPerson, stepPeople } from '../people'
import { findRoute } from '../routing'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function burn(state: EngineState, units: Unit[]): void {
  state.activeFire = {
    kind: 'fire', floor: units[0]!.floor, burningUnitIds: units.map((unit) => unit.id),
    spreadRemainingMin: 15, responseRemainingMin: 999,
  }
  const rng = state.rng.state()
  stepEngine(state, [{ type: 'respondToFire', choice: 'dispatch' }], 0)
  expect(state.rng.state()).toBe(rng)
  expect(units.every((unit) => unit.offline && unit.damageKind === 'fire')).toBe(true)
}

function travel(state: EngineState, minutes = 5): void {
  for (let elapsed = 0; elapsed < minutes; elapsed += 0.05) {
    stepElevators(state, 0.05, [])
    stepPeople(state, 0.05, [])
  }
}

function resume(state: EngineState): EngineState {
  expect(saveSandbox(state, 'damage-a')).toEqual({ ok: true })
  const saved = loadSandbox('damage-a')
  expect(saved).not.toBeNull()
  return restoreSandbox(saved!)
}

function expectSameSave(a: EngineState, b: EngineState): void {
  expect(saveSandbox(a, 'damage-a')).toEqual({ ok: true })
  expect(saveSandbox(b, 'damage-b')).toEqual({ ok: true })
  expect(loadSandbox('damage-b')).toEqual(loadSandbox('damage-a'))
}

function tower(top = 1): EngineState {
  const state = makeTestState()
  setStars(state, 4)
  for (let floor = 0; floor <= top; floor += 1) placeSlabRow(state, floor, 0, 40)
  return state
}

beforeEach(() => localStorage.clear())

describe('incident damage to walking connectors', () => {
  it.each(['stairs', 'escalator'] as const)('excludes damaged %s from fresh and pre-cached routes, then restores access on repair', (kind) => {
    for (const cached of [false, true]) for (const alternate of [false, true]) {
      const state = tower()
      const id = place(state, kind, 0, 5)
      const unit = state.units.find((candidate) => candidate.id === id)!
      const backup = alternate ? placeShaft(state, 'standard', 30, 0, 1) : null
      if (cached) expect(findRoute(state, 0, 5, 1, 5)?.[0]?.type).toBe(kind)
      const version = state.structureVersion
      burn(state, [unit])
      expect(state.structureVersion).toBe(version + 1)
      const route = findRoute(state, 0, 5, 1, 5)
      if (alternate) expect(route?.some((leg) => leg.shaftId === backup)).toBe(true)
      else expect(route).toBeNull()
      expect(route?.some((leg) => leg.type === kind) ?? false).toBe(false)
      repairUnit(state, id, [])
      expect(findRoute(state, 0, 5, 1, 5)?.[0]?.type).toBe(kind)
    }
  })

  it.each(['stairs', 'escalator'] as const)('replans in-flight %s users and leaves unrelated journeys unchanged', (kind) => {
    for (const alternate of [false, true]) {
      const state = tower()
      const id = place(state, kind, 0, 5)
      const backup = alternate ? placeShaft(state, 'standard', 30, 0, 1) : null
      const person = spawnPerson(state, { tier: 'med', floor: 0, x: 5, toFloor: 1, toX: 5, purpose: 'shopping' })!
      stepPeople(state, 0.1, [])
      expect(person.floor).toBeGreaterThan(0)
      const unrelated = spawnPerson(state, { tier: 'med', floor: 1, x: 0, toFloor: 1, toX: 10, purpose: 'shopping' })!
      const unchanged = JSON.stringify(unrelated)
      burn(state, [state.units.find((unit) => unit.id === id)!])
      expect(JSON.stringify(unrelated)).toBe(unchanged)
      expect(person.floor).toBe(0)
      if (alternate) expect(person.legs.some((leg) => leg.shaftId === backup)).toBe(true)
      else expect(state.people).not.toContain(person)
      travel(state)
      if (alternate) expect(person.floor).toBe(1)
      expect(state.people).toHaveLength(0)
    }
  })

  it.each([false, true])('preserves an intact ride while replacing its damaged stair tail (alternate=%s)', (alternate) => {
    const state = tower(2)
    const carrier = placeShaft(state, 'standard', 10, 0, 1)
    const stairs = place(state, 'stairs', 1, 20)
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: 10, toFloor: 2, toX: 20, purpose: 'shopping' })!
    for (let i = 0; i < 100 && person.state !== 'riding'; i += 1) {
      stepElevators(state, 0.01, [])
      stepPeople(state, 0.01, [])
    }
    expect(person.state).toBe('riding')
    const current = { ...person.legs[person.legIndex]! }
    const backup = alternate ? placeShaft(state, 'standard', 30, 1, 2) : null
    burn(state, [state.units.find((unit) => unit.id === stairs)!])
    const car = state.shafts.find((shaft) => shaft.id === carrier)!.cars[0]!
    if (alternate) {
      expect(person.state).toBe('riding')
      expect(person.legs[person.legIndex]).toEqual(current)
      expect(car.passengerIds).toContain(person.id)
      expect(person.legs.some((leg) => leg.shaftId === backup)).toBe(true)
      const restored = resume(state)
      travel(state)
      travel(restored)
      expectSameSave(state, restored)
      expect(person.floor).toBe(2)
    } else {
      expect(state.people).toHaveLength(0)
      expect(car.passengerIds).toEqual([])
    }
  })

  it('applies batch damage before replanning and evicts newly inaccessible tenants immediately', () => {
    const state = tower()
    const ids = [place(state, 'stairs', 0, 5), place(state, 'stairs', 0, 15)]
    const person = spawnPerson(state, { tier: 'med', floor: 0, x: 5, toFloor: 1, toX: 5, purpose: 'shopping' })!
    const office = injectUnit(state, { kind: 'officeS', floor: 1, x: 20, width: 6, storeys: 1, occupied: true, population: { low: 4, med: 0, high: 0, vip: 0 } })
    const version = state.structureVersion
    burn(state, ids.map((id) => state.units.find((unit) => unit.id === id)!))
    expect(state.structureVersion).toBe(version + 1)
    expect(state.people).not.toContain(person)
    expect(office.occupied).toBe(false)
    expect(office.flags.noRoute).toBe(true)
    expect(office.vacancyReason).toBe('noRoute')
  })

  it('also invalidates connectors damaged by an explosion', () => {
    const state = tower()
    const stairs = place(state, 'stairs', 0, 5)
    expect(findRoute(state, 0, 5, 1, 5)).not.toBeNull()
    state.activeBombThreat = { kind: 'bombThreat', floor: 0, x: 5, ransom: 100, sweepRemainingMin: null }
    state.rng = { next: () => 0, state: () => 1 }
    stepEngine(state, [{ type: 'resolveBombThreat', choice: 'sweep' }], 0)
    expect(state.units.find((unit) => unit.id === stairs)?.damageKind).toBe('explosion')
    expect(findRoute(state, 0, 5, 1, 5)).toBeNull()
  })
})

describe('damaged parking infrastructure', () => {
  it('refreshes ramp-chain flags immediately, retains owners over save/resume, and releases cars on evening departure', () => {
    const state = tower()
    for (const floor of [-1, -2]) placeSlabRow(state, floor, 0, 40)
    placeShaft(state, 'standard', 30, -2, 1)
    const ramps = [-1, -2].map((floor) => injectUnit(state, { kind: 'parkingRamp', floor, x: 0, width: 6, storeys: 1 }))
    const stalls = [-1, -2].map((floor) => injectUnit(state, { kind: 'parkingSpace', floor, x: 10, width: 2, storeys: 1 }))
    const office = injectUnit(state, { kind: 'officeS', floor: 1, x: 0, width: 6, storeys: 1, occupied: true, population: { low: 0, med: 2, high: 0, vip: 0 } })
    injectUnit(state, { kind: 'restroom', floor: 1, x: 10, width: 4, storeys: 1 })
    for (const stall of stalls) expect(claimStall(state, office.id, 'med')).toBe(stall)
    burn(state, [ramps[0]!])
    expect([...rampServedFloors(state)]).toEqual([])
    expect(stalls.every((stall) => stall.flags.noRoute && stall.population.med === 1)).toBe(true)
    expect(functionalStalls(state)).toEqual([])
    expect(claimStall(state, office.id, 'high')).toBeNull()
    occupancyPass(state, []) // the daily refresh must preserve the same ownership
    expect(stalls.every((stall) => stall.population.med === 1)).toBe(true)
    const restored = resume(state)
    for (const candidate of [state, restored]) {
      repairUnit(candidate, ramps[0]!.id, [])
      expect(functionalStalls(candidate)).toHaveLength(2)
      expect(candidate.units.filter((unit) => unit.kind === 'parkingSpace').every((stall) => !stall.flags.noRoute)).toBe(true)
      expect(claimStall(candidate, office.id, 'high')).toBeNull()
      // Damage again: existing owners can still walk to their cars and drive off.
      const ramp = candidate.units.find((unit) => unit.id === ramps[0]!.id)!
      candidate.activeFire = { kind: 'fire', floor: -1, burningUnitIds: [ramp.id], spreadRemainingMin: 15, responseRemainingMin: 999 }
      respondToFire(candidate, 'dispatch', [])
      for (let minute = 17 * 60; minute <= 19 * 60; minute += 1) stepSchedules(candidate, minute - 1, minute, [])
      travel(candidate, 8)
      expect(candidate.units.filter((unit) => unit.kind === 'parkingSpace').every((stall) => !stall.occupied && stall.population.med === 0)).toBe(true)
      expect(snapshotParkingRuntime(candidate).stallsByOffice).toEqual([])
    }
    expectSameSave(state, restored)
  })
})
