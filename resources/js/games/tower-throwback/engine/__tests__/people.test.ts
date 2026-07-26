import type { EngineEvent, EngineState } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { spawnPerson, stepPeople } from '../people'
import { injectUnit, makeTestState, placeShaft, placeSlabRow } from './testState'

const DT = 0.25

function simulate(state: EngineState, minutes: number, events: EngineEvent[] = []): void {
  for (let t = 0; t < minutes; t += DT) {
    stepElevators(state, DT, events)
    stepPeople(state, DT, events)
  }
}

describe('journey lifecycle', () => {
  it('walk → queue → ride → walk → despawn, tenancy untouched', () => {
    const state = makeTestState()
    for (let f = 0; f <= 3; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    placeShaft(state, 'standard', 10, 0, 3)
    const office = injectUnit(state, {
      kind: 'officeS', floor: 3, x: 20, width: 6, storeys: 1,
      occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 },
    })

    const person = spawnPerson(state, {
      tier: 'med', floor: 0, x: 0, toFloor: 3, toX: 20,
      purpose: 'commuteIn', tenantUnitId: office.id, destUnitId: office.id,
    })!
    expect(person.state).toBe('walking')
    const seen = new Set<string>()
    for (let t = 0; t < 30 && state.people.length > 0; t += DT) {
      seen.add(person.state)
      stepElevators(state, DT, [])
      stepPeople(state, DT, [])
    }
    expect(state.people).toHaveLength(0) // arrived and despawned
    expect(seen).toEqual(new Set(['walking', 'queued', 'riding']))
    // Tenancy counter handshake: population never changes from journeys.
    expect(office.population).toEqual({ low: 0, med: 4, high: 0, vip: 0 })
  })
})

describe('patience', () => {
  function starvedRider(state: EngineState): ReturnType<typeof spawnPerson> {
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    placeShaft(state, 'standard', 2, 0, 5)
    return spawnPerson(state, { tier: 'med', floor: 0, x: 2, toFloor: 5, toX: 20, purpose: 'shopping' })
  }

  it('expiry marks stress, tints, and reroutes around the shaft once', () => {
    const state = makeTestState()
    for (let f = 0; f <= 5; f++) {
      placeSlabRow(state, f, 0, 30)
    }
    const shaftA = placeShaft(state, 'standard', 2, 0, 5)
    const shaftB = placeShaft(state, 'standard', 8, 0, 5)
    const apt = injectUnit(state, {
      kind: 'aptStudio', floor: 5, x: 20, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    const person = spawnPerson(state, {
      tier: 'med', floor: 0, x: 2, toFloor: 5, toX: 20,
      purpose: 'commuteIn', tenantUnitId: apt.id, destUnitId: apt.id,
    })!
    expect(person.legs.find((l) => l.type === 'elevator')?.shaftId).toBe(shaftA)

    // Never step elevators → the queue starves and patience runs out.
    person.patienceLeft = 0.1
    stepPeople(state, 0.2, [])
    expect(person.irritated).toBe(true)
    expect(apt.stressMarks).toBe(1)
    expect(person.legs.find((l) => l.type === 'elevator')?.shaftId).toBe(shaftB)
    expect(person.patienceLeft).toBeCloseTo(
      TUNING.people.patienceByTier.med * TUNING.people.reboardPatienceFactor,
    )

    // Second starvation → abandon (despawn), one more stress mark.
    stepPeople(state, 1, []) // walks to shaft B and queues
    person.patienceLeft = 0.1
    stepPeople(state, 0.2, [])
    expect(state.people).toHaveLength(0)
    expect(apt.stressMarks).toBe(2)
  })

  it('abandons immediately when no alternative route exists', () => {
    const state = makeTestState()
    const person = starvedRider(state)!
    person.patienceLeft = 0.1
    stepPeople(state, 0.2, [])
    expect(state.people).toHaveLength(0)
  })
})

describe('pass-by sales', () => {
  function walkPast(state: EngineState, tier: 'low' | 'med', walkers: number): void {
    for (let i = 0; i < walkers; i++) {
      spawnPerson(state, { tier, floor: 0, x: 0, toFloor: 0, toX: 29, purpose: 'errand' })
      simulate(state, 1)
    }
  }

  it('credits half-price impulse buys, affordability-gated', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 29)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 10, width: 12, storeys: 1, occupied: true })
    const fundsBefore = state.funds
    walkPast(state, 'low', 40)
    // fastfood is affordable to everyone: P=0.1 per pass, income 10 × 0.5 = 5.
    const earned = state.funds - fundsBefore
    expect(earned).toBeGreaterThan(0)
    expect(earned % 5).toBe(0)
    expect(state.ledgerToday.lines['sales.commerce']).toBe(earned)
  })

  it('low-tier walkers never buy from a shop (med+ gate)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 29)
    injectUnit(state, { kind: 'shop', floor: 0, x: 10, width: 8, storeys: 1, occupied: true })
    const fundsBefore = state.funds
    walkPast(state, 'low', 40)
    expect(state.funds).toBe(fundsBefore)
  })
})

describe('LOD overflow', () => {
  it('defers spawns past maxActive and drains as slots free', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    for (let i = 0; i < TUNING.people.maxActive + 5; i++) {
      spawnPerson(state, { tier: 'low', floor: 0, x: 0, toFloor: 0, toX: 30, purpose: 'errand' })
    }
    expect(state.people).toHaveLength(TUNING.people.maxActive)

    // Free 5 slots; the deferred FIFO drains on the next tick.
    for (let i = 0; i < 5; i++) {
      state.people.pop()
    }
    stepPeople(state, 0.01, [])
    expect(state.people).toHaveLength(TUNING.people.maxActive)
  })
})

describe('visit income and dwell', () => {
  it('posts per-visit income once on arrival, dwells, returns, despawns', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 20, width: 12, storeys: 1, occupied: true })
    const shop = state.units[state.units.length - 1]!
    const events: EngineEvent[] = []
    spawnPerson(state, {
      tier: 'low', floor: 0, x: 0, toFloor: 0, toX: 20,
      purpose: 'shopping', destUnitId: shop.id, dwellMin: 20,
    })
    simulate(state, 1, events) // walk 20 tiles = 1/3 min → arrived, income posted
    expect(state.ledgerToday.lines['sales.commerce']).toBe(10)
    expect(state.people).toHaveLength(1) // dwelling

    simulate(state, 25, events) // dwell 20 min then walk home
    expect(state.people).toHaveLength(0)
    expect(state.ledgerToday.lines['sales.commerce']).toBe(10) // still once
  })
})
