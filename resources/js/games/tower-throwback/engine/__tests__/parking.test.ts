import type { EngineState, Unit } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { evalUnit, occupancyPass } from '../occupancy'
import { clearAllStalls, functionalStalls, parkingDemand, parkingShortfall, rampServedFloors } from '../parking'
import { stepPeople } from '../people'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

function basementTower(state: EngineState): { stalls: Unit[]; office: Unit } {
  setStars(state, 3, 3)
  placeSlabRow(state, 0, 0, 60)
  placeSlabRow(state, -1, 0, 60)
  placeSlabRow(state, -2, 0, 60)
  placeSlabRow(state, 1, 0, 60)
  placeShaft(state, 'standard', 40, -2, 1)
  injectUnit(state, { kind: 'parkingRamp', floor: -1, x: 0, width: 6, storeys: 1 })
  injectUnit(state, { kind: 'parkingRamp', floor: -2, x: 0, width: 6, storeys: 1 })
  const stalls = [
    injectUnit(state, { kind: 'parkingSpace', floor: -2, x: 10, width: 2, storeys: 1 }),
    injectUnit(state, { kind: 'parkingSpace', floor: -2, x: 14, width: 2, storeys: 1 }),
  ]
  const office = injectUnit(state, {
    kind: 'officeS', floor: 1, x: 0, width: 6, storeys: 1,
    occupied: true, population: { low: 0, med: 2, high: 2, vip: 0 },
  })
  injectUnit(state, { kind: 'restroom', floor: 1, x: 10, width: 4, storeys: 1 })
  return { stalls, office }
}

describe('ramp chain', () => {
  it('serves basement floors only through a contiguous ramp chain from −1', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, -1, 0, 40)
    placeSlabRow(state, -2, 0, 40)
    injectUnit(state, { kind: 'parkingRamp', floor: -2, x: 0, width: 6, storeys: 1 })
    const stall = injectUnit(state, { kind: 'parkingSpace', floor: -2, x: 10, width: 2, storeys: 1 })

    // B2 ramp alone is a dead end — no chain from −1.
    expect(rampServedFloors(state).has(-2)).toBe(false)
    expect(functionalStalls(state)).toHaveLength(0)
    occupancyPass(state, [])
    expect(stall.flags.noRoute).toBe(true)

    injectUnit(state, { kind: 'parkingRamp', floor: -1, x: 0, width: 6, storeys: 1 })
    expect(rampServedFloors(state).has(-2)).toBe(true)
    expect(functionalStalls(state)).toHaveLength(1)
    occupancyPass(state, [])
    expect(stall.flags.noRoute).toBe(false)
  })
})

describe('demand and shortfall', () => {
  it('computes suites + offices/4 and gates the penalty on the 3★ unlock', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 80)
    injectUnit(state, { kind: 'hotelSuite', floor: 0, x: 0, width: 10, storeys: 1 })
    for (let i = 0; i < 8; i++) {
      injectUnit(state, {
        kind: 'officeS', floor: 0, x: 12 + i * 6, width: 6, storeys: 1,
        occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 },
      })
    }
    expect(parkingDemand(state)).toBe(1 + 2) // 1 suite + floor(8/4)

    expect(parkingShortfall(state)).toBe(false) // still 1★ — class not unlocked
    setStars(state, 3, 3)
    expect(parkingShortfall(state)).toBe(true)
  })

  it('applies and clears the office eval penalty with the shortfall', () => {
    const state = makeTestState()
    const { stalls, office } = basementTower(state)
    // Demand = floor(1 office / 4) = 0 → add 3 more occupied offices for demand 1.
    for (let i = 0; i < 3; i++) {
      injectUnit(state, {
        kind: 'officeS', floor: 1, x: 20 + i * 6, width: 6, storeys: 1,
        occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 },
      })
    }
    expect(parkingShortfall(state)).toBe(false) // 2 stalls ≥ demand 1
    const withParking = evalUnit(state, office)

    for (const stall of stalls) {
      stall.offline = true // knock the garage out
    }
    expect(parkingShortfall(state)).toBe(true)
    expect(evalUnit(state, office)).toBe(withParking - 5)
  })
})

describe('car commuters', () => {
  it('fills stalls deterministically in id order and reverses in the evening', () => {
    const state = makeTestState()
    const { stalls, office } = basementTower(state)
    void office

    // Morning arrival window: med/high workers claim stalls first-come.
    for (let m = 7 * 60; m <= 9 * 60 + 30; m++) {
      stepSchedules(state, m - 1, m, [])
    }
    const parked = stalls.filter((s) => s.occupied)
    expect(parked).toHaveLength(2)
    expect(stalls[0]!.occupied).toBe(true) // lowest stall id fills first
    const garageSpawns = state.people.filter((p) => p.floor === -2)
    expect(garageSpawns.length).toBeGreaterThan(0)

    // Let the morning crowd finish their journeys.
    for (let t = 0; t < 200 && state.people.length > 0; t += 0.5) {
      stepElevators(state, 0.5, [])
      stepPeople(state, 0.5, [])
    }

    // Evening: departing workers drive off; arrival at the stall clears it.
    for (let m = 17 * 60; m <= 19 * 60; m++) {
      stepSchedules(state, m - 1, m, [])
    }
    for (let t = 0; t < 300 && state.people.length > 0; t += 0.5) {
      stepElevators(state, 0.5, [])
      stepPeople(state, 0.5, [])
    }
    expect(stalls.every((s) => !s.occupied)).toBe(true)
  })

  it('clearAllStalls resets the garage', () => {
    const state = makeTestState()
    const { stalls } = basementTower(state)
    stalls[0]!.population.med = 1
    stalls[0]!.occupied = true
    clearAllStalls(state)
    expect(stalls[0]!.occupied).toBe(false)
    expect(stalls[0]!.population.med).toBe(0)
  })
})
