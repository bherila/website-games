import type { EngineState, Person } from '../../gameTypes'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

function minuteByMinute(state: EngineState, from: number, to: number): Map<number, Person[]> {
  const spawnsAt = new Map<number, Person[]>()
  for (let m = from; m <= to; m++) {
    const before = new Set(state.people.map((p) => p.id))
    stepSchedules(state, m - 1, m, [])
    const fresh = state.people.filter((p) => !before.has(p.id))
    if (fresh.length > 0) {
      spawnsAt.set(m, fresh)
    }
  }
  return spawnsAt
}

function officeTower(day = 1): EngineState {
  const state = makeTestState()
  state.clock.day = day
  placeSlabRow(state, 0, 0, 40)
  injectUnit(state, {
    kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1,
    occupied: true, population: { low: 1, med: 2, high: 1, vip: 0 },
  })
  return state
}

describe('office commutes', () => {
  it('capacity arrives uniformly over 07:00–09:30 on weekdays', () => {
    const state = officeTower()
    const spawns = minuteByMinute(state, 420, 570)
    // i-th of 4 workers moves at 420 + floor((i+0.5)×150/4).
    expect([...spawns.keys()]).toEqual([438, 476, 513, 551])
    expect([...spawns.values()].flat()).toHaveLength(4)
    const tiers = [...spawns.values()].flat().map((p) => p.tier)
    expect(tiers).toEqual(['low', 'med', 'med', 'high']) // tenancy tier layout
    expect([...spawns.values()].flat().every((p) => p.purpose === 'commuteIn')).toBe(true)
  })

  it('departures spread over 17:00–19:00', () => {
    const state = officeTower()
    const spawns = minuteByMinute(state, 1020, 1140)
    expect([...spawns.keys()]).toEqual([1035, 1065, 1095, 1125])
    expect([...spawns.values()].flat().every((p) => p.purpose === 'commuteOut')).toBe(true)
  })

  it('offices are closed on weekends', () => {
    const state = officeTower(6)
    const spawns = minuteByMinute(state, 420, 570)
    expect(spawns.size).toBe(0)
  })
})

describe('resident commutes', () => {
  function aptTower(day = 1): EngineState {
    const state = makeTestState()
    state.clock.day = day
    placeSlabRow(state, 0, 0, 40)
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    return state
  }

  it('80% depart 07:00–09:00 and return 17:30–19:30 on weekdays', () => {
    const state = aptTower()
    // round(2 × 0.8) = 2 commuters at 420 + floor((i+0.5)×120/2).
    const out = minuteByMinute(state, 420, 540)
    expect([...out.keys()]).toEqual([450, 510])
    expect([...out.values()].flat().every((p) => p.purpose === 'commuteOut')).toBe(true)

    const back = minuteByMinute(state, 1050, 1170)
    expect([...back.keys()]).toEqual([1080, 1140])
    expect([...back.values()].flat().every((p) => p.purpose === 'commuteIn')).toBe(true)
  })
})

describe('lunch trips', () => {
  it('rolls once at 11:30 and spawns during the lunch window', () => {
    const state = officeTower()
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 20, width: 12, storeys: 1, occupied: true })
    const spawns = minuteByMinute(state, 690, 810)
    const lunchers = [...spawns.values()].flat().filter((p) => p.purpose === 'lunch')
    // Deterministic for seed 1: P=0.7 across 4 workers.
    expect(lunchers.length).toBeGreaterThan(0)
    expect(lunchers.length).toBeLessThanOrEqual(4)
    expect(lunchers.every((p) => p.destUnitId !== null)).toBe(true)
  })

  it('no lunch spawns without an affordable food unit', () => {
    const state = officeTower()
    const spawns = minuteByMinute(state, 690, 810)
    expect([...spawns.values()].flat().filter((p) => p.purpose === 'lunch')).toHaveLength(0)
  })

  it('routes lunch to a reachable venue over a nearer unreachable one', () => {
    const state = officeTower() // office on floor 0, slab row 0
    placeSlabRow(state, 1, 0, 40)
    placeSlabRow(state, 2, 0, 40)
    const shaftId = placeShaft(state, 'standard', 2, 0, 2)
    const shaft = state.shafts.find((s) => s.id === shaftId)!
    shaft.enabledStops = [0, 2] // no stop at floor 1 → floor 1 unreachable from floor 0
    state.structureVersion += 1 // invalidate the routing graph for the edited stops

    // Nearer by |Δfloor| (1) but unreachable; farther (2) but reachable via the shaft.
    const unreachable = injectUnit(state, { kind: 'fastfood', floor: 1, x: 12, width: 12, storeys: 1, occupied: true })
    const reachable = injectUnit(state, { kind: 'fastfood', floor: 2, x: 12, width: 12, storeys: 1, occupied: true })
    const lunchers = [...minuteByMinute(state, 690, 810).values()].flat().filter((p) => p.purpose === 'lunch')

    expect(lunchers.length).toBeGreaterThan(0)
    expect(lunchers.every((p) => p.destUnitId === reachable.id)).toBe(true)
    expect(lunchers.some((p) => p.destUnitId === unreachable.id)).toBe(false)
  })
})

describe('weekend errands', () => {
  it('residents run errands between 10:00 and 20:00 on weekends', () => {
    const state = makeTestState()
    state.clock.day = 6
    placeSlabRow(state, 0, 0, 40)
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    const spawns = minuteByMinute(state, 600, 1300)
    const errands = [...spawns.values()].flat().filter((p) => p.purpose === 'errand')
    expect(errands.length).toBeGreaterThan(0) // deterministic for seed 1, P=0.5 × 2 residents
  })
})

describe('exogenous shoppers', () => {
  function mall(day: number): EngineState {
    const state = makeTestState()
    state.clock.day = day
    placeSlabRow(state, 0, 0, 60)
    // 3 shops (med+) + 1 fastfood (all tiers) → low shoppers have a destination.
    for (let i = 0; i < 3; i++) {
      injectUnit(state, { kind: 'shop', floor: 0, x: 10 + i * 10, width: 8, storeys: 1, occupied: true })
    }
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 40, width: 12, storeys: 1, occupied: true })
    return state
  }

  it('spawns round((2+star) × count^0.7) per hour, ×1.5 weekends', () => {
    const weekday = mall(1)
    stepSchedules(weekday, 599, 600, [])
    // (2+1) × 4^0.7 = 7.917 → 8.
    expect(weekday.people).toHaveLength(8)

    const weekend = mall(6)
    stepSchedules(weekend, 599, 600, [])
    // 7.917 × 1.5 = 11.876 → 12.
    expect(weekend.people).toHaveLength(12)

    // Outside the 10:00–20:00 hourly window nothing spawns.
    const late = mall(1)
    stepSchedules(late, 1319, 1320, [])
    expect(late.people).toHaveLength(0)
  })

  it('excludes commerce unreachable from the street entrance from shoppers', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    placeSlabRow(state, 2, 0, 60)
    const reachable = injectUnit(state, { kind: 'fastfood', floor: 0, x: 20, width: 12, storeys: 1, occupied: true })
    // Floor 2 has a slab but no elevator/stairs up → unreachable from the street.
    const unreachable = injectUnit(state, { kind: 'fastfood', floor: 2, x: 20, width: 12, storeys: 1, occupied: true })
    stepSchedules(state, 599, 600, [])
    const shoppers = state.people.filter((p) => p.purpose === 'shopping')

    expect(shoppers.length).toBeGreaterThan(0)
    expect(shoppers.some((p) => p.destUnitId === unreachable.id)).toBe(false)
    expect(shoppers.every((p) => p.destUnitId === reachable.id)).toBe(true)
  })

  it('tier mix and destinations are deterministic per seed', () => {
    const run = () => {
      const state = mall(1)
      stepSchedules(state, 599, 600, [])
      return state.people.map((p) => `${p.tier}:${p.destUnitId}`)
    }
    expect(run()).toEqual(run())
    expect(run().some((t) => t.startsWith('low'))).toBe(true)
  })
})

describe('subway', () => {
  function subwayTower(withShaft: boolean): EngineState {
    const state = makeTestState()
    state.clock.day = 1
    setStars(state, 3, 3) // underground + subway unlock
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    for (let f = -1; f >= -10; f--) {
      placeSlabRow(state, f, 0, 40)
    }
    if (withShaft) {
      placeShaft(state, 'standard', 34, -10, 1) // placed last → stops on every floor
    }
    injectUnit(state, { kind: 'subway', floor: -10, x: 0, width: 30, storeys: 1 })
    return state
  }

  it('routes a deterministic share of office workers through the subway', () => {
    const state = subwayTower(true)
    injectUnit(state, {
      kind: 'officeS', floor: 1, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 4, med: 0, high: 0, vip: 0 },
    })
    const spawns = minuteByMinute(state, 420, 570)
    const workers = [...spawns.values()].flat()
    expect(workers).toHaveLength(4)
    // subwayShare 0.3 → index 3 of each 4 workers arrives via the subway at B10.
    expect(workers.filter((p) => p.floor === -10)).toHaveLength(1)
    expect(workers.filter((p) => p.floor === 0)).toHaveLength(3)
  })

  it('shoppers split between street and subway when one exists', () => {
    const state = subwayTower(true)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 40, width: 12, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'shop', floor: 0, x: 52, width: 8, storeys: 1, occupied: true })
    stepSchedules(state, 599, 600, [])
    stepSchedules(state, 659, 660, [])
    expect(state.people.filter((p) => p.floor === -10).length).toBeGreaterThan(0) // deterministic for seed 1
    expect(state.people.filter((p) => p.floor === 0).length).toBeGreaterThan(0)
  })

  it('falls back to the street when the subway has no route up', () => {
    const state = subwayTower(false)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 40, width: 12, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'shop', floor: 0, x: 52, width: 8, storeys: 1, occupied: true })
    stepSchedules(state, 599, 600, [])
    expect(state.people.length).toBeGreaterThan(0)
    expect(state.people.every((p) => p.floor === 0)).toBe(true)
  })
})
