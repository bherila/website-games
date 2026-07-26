import type { EngineState, Person } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, placeSlabRow, setStars } from './testState'

function tick(state: EngineState, minute: number): Person[] {
  const before = new Set(state.people.map((p) => p.id))
  stepSchedules(state, minute - 1, minute, [])
  return state.people.filter((p) => !before.has(p.id))
}

describe('evening diners', () => {
  it('spawns per the hourly formula, gated by affordability', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    injectUnit(state, { kind: 'restaurant', floor: 0, x: 10, width: 10, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'fancyRestaurant', floor: 0, x: 22, width: 12, storeys: 1, occupied: true })

    // round(3 × (1+1) × 2^0.7) = round(9.75) = 10 attempts; low-tier picks skip.
    // Diners spawn on the half-hour (staggered off the shopper wave).
    const diners = tick(state, 17 * 60 + 30)
    expect(diners.length).toBeGreaterThan(0)
    expect(diners.length).toBeLessThanOrEqual(10)
    expect(diners.every((p) => p.tier !== 'low')).toBe(true) // low can't afford sit-down dinner
    expect(diners.every((p) => p.purpose === 'shopping')).toBe(true)

    // Outside the 17:00–21:00 window nothing spawns on the half-hour.
    expect(tick(state, 16 * 60 + 30)).toHaveLength(0)
    expect(tick(state, 21 * 60 + 30)).toHaveLength(0)
  })

  it('fancy restaurants only host high tier', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const fancy = injectUnit(state, { kind: 'fancyRestaurant', floor: 0, x: 10, width: 12, storeys: 1, occupied: true })
    const diners = tick(state, 18 * 60 + 30)
    expect(diners.length).toBeGreaterThan(0)
    expect(diners.every((p) => p.destUnitId === fancy.id && (p.tier === 'high' || p.tier === 'vip'))).toBe(true)
  })
})

describe('theater showtimes', () => {
  function cinema(day: number): { state: EngineState; theaterId: number } {
    const state = makeTestState()
    state.clock.day = day
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    const theater = injectUnit(state, { kind: 'movieTheater', floor: 0, x: 10, width: 20, storeys: 2, occupied: true })
    return { state, theaterId: theater.id }
  }

  it('spawns base + perStar × star at each showtime', () => {
    const { state, theaterId } = cinema(1)
    const batch = TUNING.commerce.theaterBatchBase + TUNING.commerce.theaterBatchPerStar * 3 // 50
    // 19:00 is also a shopper hour-top; the 21:00 show is past the shopper window → pure batch.
    expect(tick(state, 1140).length).toBeGreaterThanOrEqual(batch)
    const lateShow = tick(state, 1260)
    expect(lateShow).toHaveLength(batch)
    expect(lateShow.every((p) => p.destUnitId === theaterId)).toBe(true)
    expect(lateShow.every((p) => p.tier === 'med' || p.tier === 'high')).toBe(true)
  })

  it('runs the matinee on weekends only', () => {
    // 14:00 is a shopper hour-top on both days; the matinee batch (50) only adds on weekends.
    const batch = TUNING.commerce.theaterBatchBase + TUNING.commerce.theaterBatchPerStar * 3
    const weekday = tick(cinema(1).state, TUNING.commerce.weekendMatineeMinute)
    const weekend = tick(cinema(6).state, TUNING.commerce.weekendMatineeMinute)
    expect(weekday.length).toBeLessThan(batch)
    expect(weekend.length).toBeGreaterThanOrEqual(batch)
  })
})

describe('conference batches', () => {
  function convention(day: number): { state: EngineState; centerId: number } {
    const state = makeTestState()
    state.clock.day = day
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    const center = injectUnit(state, { kind: 'conferenceCenter', floor: 0, x: 10, width: 24, storeys: 2, occupied: true })
    return { state, centerId: center.id }
  }

  it('two weekday batches of ceil(15 × star / 2) med/high attendees', () => {
    const { state, centerId } = convention(1)
    const morning = tick(state, 9 * 60)
    expect(morning).toHaveLength(Math.ceil((15 * 3) / 2)) // 23
    expect(morning.every((p) => p.destUnitId === centerId)).toBe(true)
    expect(morning.every((p) => p.tier === 'med' || p.tier === 'high')).toBe(true)
    // 13:00 is also a shopper hour-top — at least the batch arrives.
    expect(tick(state, 13 * 60).length).toBeGreaterThanOrEqual(23)
  })

  it('does not run on weekends', () => {
    const { state } = convention(6)
    expect(tick(state, 9 * 60)).toHaveLength(0)
  })
})

describe('weekend events', () => {
  function ballroom(day: number): { state: EngineState; spaceId: number } {
    const state = makeTestState()
    state.clock.day = day
    setStars(state, 5, 5)
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    const space = injectUnit(state, { kind: 'eventSpace', floor: 0, x: 10, width: 30, storeys: 2, occupied: true })
    return { state, spaceId: space.id }
  }

  it('posts event income and routes a high-tier crowd on weekend evenings', () => {
    const { state, spaceId } = ballroom(6)
    const fundsBefore = state.funds
    const crowd = tick(state, TUNING.commerce.eventMinute)
    expect(state.funds).toBe(fundsBefore + TUNING.commerce.eventIncome)
    expect(state.ledgerToday.lines['events.income']).toBe(TUNING.commerce.eventIncome)
    // 18:00 is also a shopper hour-top — event guests are the 'amenity' crowd.
    const guests = crowd.filter((p) => p.purpose === 'amenity')
    expect(guests).toHaveLength(TUNING.commerce.eventVisitors)
    expect(guests.every((p) => p.tier === 'high' && p.destUnitId === spaceId)).toBe(true)
  })

  it('never fires on weekdays', () => {
    const { state } = ballroom(3)
    const crowd = tick(state, TUNING.commerce.eventMinute)
    expect(crowd.filter((p) => p.purpose === 'amenity')).toHaveLength(0)
    expect(state.ledgerToday.lines['events.income']).toBeUndefined()
  })
})

describe('amenity visits', () => {
  it('plans deterministic tenant trips at 08:30 with tier gating', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 80)
    setStars(state, 4, 4)
    injectUnit(state, { kind: 'fitness', floor: 0, x: 6, width: 12, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'spa', floor: 0, x: 14, width: 12, storeys: 1, occupied: true })
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 30, width: 4, storeys: 1,
      occupied: true, population: { low: 0, med: 10, high: 10, vip: 0 },
    })
    tick(state, 8 * 60 + 30) // planning pass — visits land in the evening window

    const visits: Person[] = []
    for (let m = 17 * 60; m <= 20 * 60; m++) {
      // Shoppers/commuters share the window — amenity trips are purpose-tagged.
      visits.push(...tick(state, m).filter((p) => p.purpose === 'amenity'))
    }
    expect(visits.length).toBeGreaterThan(0) // deterministic for seed 1 (20 occupants × P≥0.1)
    // Spa is high+: no med-tier person may target it.
    const spaId = state.units.find((u) => u.kind === 'spa')!.id
    expect(visits.filter((p) => p.destUnitId === spaId).every((p) => p.tier === 'high')).toBe(true)
  })

  it('is deterministic per seed', () => {
    const run = () => {
      const state = makeTestState()
      placeSlabRow(state, 0, 0, 80)
      injectUnit(state, { kind: 'fitness', floor: 0, x: 6, width: 12, storeys: 1, occupied: true })
      injectUnit(state, {
        kind: 'aptStudio', floor: 0, x: 30, width: 4, storeys: 1,
        occupied: true, population: { low: 0, med: 10, high: 0, vip: 0 },
      })
      tick(state, 8 * 60 + 30)
      const spawned: number[] = []
      for (let m = 17 * 60; m <= 20 * 60; m++) {
        spawned.push(...tick(state, m).filter((p) => p.purpose === 'amenity').map((p) => p.id))
      }
      return spawned
    }
    expect(run()).toEqual(run())
  })
})
