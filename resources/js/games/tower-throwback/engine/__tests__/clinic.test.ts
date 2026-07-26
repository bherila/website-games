import type { EngineState, Person, RentTier } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { isWeekend } from '../clock'
import { occupancyPass } from '../occupancy'
import { stepPeople } from '../people'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, place, placeSlabRow, setStars } from './testState'

const WORKER_WINDOW = TUNING.clinic.workerWindow
const RESIDENT_WINDOW = TUNING.clinic.residentWindow

/** Ground-floor tower with a clinic + restroom and a crowd of occupied tenants. */
function clinicTower(opts: { withRestroom?: boolean; day?: number; seed?: number } = {}): { state: EngineState; clinicId: number } {
  const { withRestroom = true, day = 1, seed = 1 } = opts
  const state = makeTestState({ seed })
  state.clock.day = day
  setStars(state, 4)
  placeSlabRow(state, 0, 0, 200)
  const clinicId = place(state, 'medicalClinic', 0, 0)
  if (withRestroom) {
    place(state, 'restroom', 0, 14)
  }
  return { state, clinicId }
}

function fillWorkers(state: EngineState, count: number): void {
  for (let i = 0; i < count; i++) {
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 30 + i * 7, width: 6, storeys: 1,
      occupied: true, population: { low: 1, med: 2, high: 1, vip: 0 },
    })
  }
}

function fillResidents(state: EngineState, count: number): void {
  for (let i = 0; i < count; i++) {
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 30 + i * 5, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
  }
}

/** Collect every person spawned across a full day, tagged with the minute they spawned. */
function spawnsOverDay(state: EngineState): Array<{ minute: number; person: Person }> {
  const seen = new Set(state.people.map((p) => p.id))
  const out: Array<{ minute: number; person: Person }> = []
  for (let m = 1; m <= 1439; m++) {
    stepSchedules(state, m - 1, m, [])
    for (const person of state.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id)
        out.push({ minute: m, person })
      }
    }
  }
  return out
}

describe('medical clinic — operating', () => {
  it('operates when routable and a restroom is in range', () => {
    const { state, clinicId } = clinicTower()
    occupancyPass(state, [])
    const clinic = state.units.find((u) => u.id === clinicId)!
    expect(clinic.flags.noRestroom).toBe(false)
    expect(clinic.occupied).toBe(true)
  })

  it('stays closed without a nearby restroom', () => {
    const { state, clinicId } = clinicTower({ withRestroom: false })
    occupancyPass(state, [])
    const clinic = state.units.find((u) => u.id === clinicId)!
    expect(clinic.flags.noRestroom).toBe(true)
    expect(clinic.occupied).toBe(false)
  })
})

describe('medical clinic — patient visits', () => {
  it('draws office workers to the clinic during business hours', () => {
    const { state, clinicId } = clinicTower()
    const clinic = state.units.find((u) => u.id === clinicId)!
    clinic.occupied = true
    fillWorkers(state, 40)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)

    expect(clinicVisits.length).toBeGreaterThan(0)
    expect(clinicVisits.every((s) => s.person.purpose === 'amenity')).toBe(true)
    expect(clinicVisits.every((s) => s.minute >= WORKER_WINDOW.start && s.minute < WORKER_WINDOW.end)).toBe(true)
  })

  it('draws residents to the clinic in the evening window', () => {
    const { state, clinicId } = clinicTower()
    const clinic = state.units.find((u) => u.id === clinicId)!
    clinic.occupied = true
    fillResidents(state, 60)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)

    expect(clinicVisits.length).toBeGreaterThan(0)
    expect(clinicVisits.every((s) => s.minute >= RESIDENT_WINDOW.start && s.minute < RESIDENT_WINDOW.end)).toBe(true)
  })

  it('generates no clinic visits when the clinic is closed', () => {
    const { state, clinicId } = clinicTower()
    // clinic left un-occupied (closed) → not an operating destination
    fillWorkers(state, 40)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)
    expect(clinicVisits).toHaveLength(0)
  })

  it('is deterministic for a given seed', () => {
    const run = (): string[] => {
      const { state, clinicId } = clinicTower({ seed: 7 })
      state.units.find((u) => u.id === clinicId)!.occupied = true
      fillWorkers(state, 20)
      return spawnsOverDay(state)
        .filter((s) => s.person.destUnitId === clinicId)
        .map((s) => `${s.minute}:${s.person.tier}`)
    }
    expect(run()).toEqual(run())
  })
})

describe('medical clinic — weekend + arrival gating', () => {
  const weekendDay = [1, 2, 3, 4, 5, 6, 7].find((d) => isWeekend(d)) ?? 6
  const weekdayDay = [1, 2, 3, 4, 5, 6, 7].find((d) => !isWeekend(d)) ?? 1
  const OFFICE_ARRIVE_END = 9 * 60 + 30

  it('skips office-worker clinic trips on weekends (offices are closed)', () => {
    const { state, clinicId } = clinicTower({ day: weekendDay })
    state.units.find((u) => u.id === clinicId)!.occupied = true
    fillWorkers(state, 40)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)
    expect(clinicVisits).toHaveLength(0)
  })

  it('still draws residents to the clinic on weekends', () => {
    const { state, clinicId } = clinicTower({ day: weekendDay })
    state.units.find((u) => u.id === clinicId)!.occupied = true
    fillResidents(state, 80)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)
    expect(clinicVisits.length).toBeGreaterThan(0)
  })

  it('never spawns a worker clinic trip before office arrivals finish (09:30)', () => {
    const { state, clinicId } = clinicTower({ day: weekdayDay })
    state.units.find((u) => u.id === clinicId)!.occupied = true
    fillWorkers(state, 60)
    const clinicVisits = spawnsOverDay(state).filter((s) => s.person.destUnitId === clinicId)
    expect(clinicVisits.length).toBeGreaterThan(0)
    expect(clinicVisits.every((s) => s.minute >= OFFICE_ARRIVE_END)).toBe(true)
  })
})

describe('medical clinic — copay income', () => {
  function dayIncome(copayTier: RentTier): number {
    const { state, clinicId } = clinicTower({ seed: 3 })
    const clinic = state.units.find((u) => u.id === clinicId)!
    clinic.occupied = true
    clinic.rentTier = copayTier
    fillWorkers(state, 40)
    // Step schedules AND people each minute so visits walk to the clinic (same
    // floor) and complete, booking copay income.
    for (let m = 1; m <= 1439; m++) {
      stepSchedules(state, m - 1, m, [])
      stepPeople(state, 1, [])
    }
    return state.ledgerToday.lines['sales.medical'] ?? 0
  }

  it('books copay visits to the sales.medical ledger line', () => {
    expect(dayIncome('avg')).toBeGreaterThan(0)
  })

  it('scales copay income with the clinic tier (high = 4× low for the same visits)', () => {
    const low = dayIncome('low')
    const high = dayIncome('high')
    // Same seed/layout ⇒ same visits; only the copay multiplier differs
    // (low 0.5 vs high 2.0 ⇒ 4× more income at the top tier).
    expect(low).toBeGreaterThan(0)
    expect(high).toBeCloseTo(low * 4, 5)
  })
})
