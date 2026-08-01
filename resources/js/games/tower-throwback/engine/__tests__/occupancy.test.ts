import type { EngineEvent, EngineState, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { evalBreakdown, evalUnit, occupancyPass, weeklyStressPass } from '../occupancy'
import { injectUnit, makeTestState, place, placeShaft, placeSlabRow, setStars } from './testState'

function bareOffice(state: EngineState, x = 0, floor = 0): Unit {
  return injectUnit(state, { kind: 'officeS', floor, x, width: 6, storeys: 1 })
}

function bareApt(state: EngineState, x = 0, floor = 0): Unit {
  return injectUnit(state, { kind: 'aptStudio', floor, x, width: 4, storeys: 1 })
}

describe('evalUnit — term isolation', () => {
  it('base: a lone unit scores 60', () => {
    const state = makeTestState()
    expect(evalUnit(state, bareOffice(state))).toBe(60)
  })

  it('amenity bonus applies in range and not out of range', () => {
    const inRange = makeTestState()
    const office = bareOffice(inRange)
    // Gap 11: inside the 20-tile amenity radius, outside fitness's 8-tile noise radius.
    injectUnit(inRange, { kind: 'fitness', floor: 0, x: 16, width: 12, storeys: 1 })
    expect(evalUnit(inRange, office)).toBe(64)

    const tooFar = makeTestState()
    const office2 = bareOffice(tooFar)
    injectUnit(tooFar, { kind: 'fitness', floor: 0, x: 31, width: 12, storeys: 1 }) // gap 26 > 20
    expect(evalUnit(tooFar, office2)).toBe(60)

    const tooHigh = makeTestState()
    const office3 = bareOffice(tooHigh)
    injectUnit(tooHigh, { kind: 'fitness', floor: 7, x: 0, width: 12, storeys: 1 }) // Δfloor 7 > 6
    expect(evalUnit(tooHigh, office3)).toBe(60)
  })

  it('amenity bonuses cap at +20', () => {
    const state = makeTestState()
    const office = bareOffice(state)
    injectUnit(state, { kind: 'fitness', floor: 6, x: 0, width: 12, storeys: 1 }) // Δ6 floors: amenity yes, noise no
    injectUnit(state, { kind: 'pool', floor: 1, x: 0, width: 20, storeys: 2 })
    injectUnit(state, { kind: 'spa', floor: 3, x: 0, width: 12, storeys: 1 })
    injectUnit(state, { kind: 'medicalClinic', floor: 4, x: 0, width: 12, storeys: 1 })
    injectUnit(state, { kind: 'securityOffice', floor: 5, x: 0, width: 10, storeys: 1 })
    injectUnit(state, { kind: 'conferenceCenter', floor: 90, x: 300, width: 24, storeys: 2 })
    // 4+4+4+3+3+5 = 23 → capped at 20.
    expect(evalUnit(state, office)).toBe(80)
  })

  it.each([
    { mapId: 'city-tower' as const, landmarkKind: 'cathedral' as const },
    { mapId: 'niagara-falls' as const, landmarkKind: 'observationDeck' as const },
  ])('grants nearby offices and restaurants the $landmarkKind landmark bonus', ({ mapId, landmarkKind }) => {
    const state = makeTestState({ mapId })
    placeSlabRow(state, 0, 0, 120)
    const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1 })
    const restaurant = injectUnit(state, { kind: 'restaurant', floor: 0, x: 55, width: 10, storeys: 1 })
    const farOffice = injectUnit(state, { kind: 'officeS', floor: 0, x: 100, width: 6, storeys: 1 })
    injectUnit(state, { kind: landmarkKind, floor: 0, x: 20, width: landmarkKind === 'cathedral' ? 30 : 24, storeys: 2 })

    expect(evalBreakdown(state, office).landmarkBonus).toBe(TUNING.evalWeights.landmarkBonus)
    expect(evalBreakdown(state, restaurant).landmarkBonus).toBe(TUNING.evalWeights.landmarkBonus)
    expect(evalBreakdown(state, farOffice).landmarkBonus).toBe(0)
  })

  it('requires the active-map landmark to be standing, online, and reachable', () => {
    const wrongMap = makeTestState({ mapId: 'niagara-falls' })
    const wrongMapOffice = bareOffice(wrongMap)
    injectUnit(wrongMap, { kind: 'cathedral', floor: 0, x: 10, width: 30, storeys: 2 })
    expect(evalBreakdown(wrongMap, wrongMapOffice).landmarkBonus).toBe(0)

    const offline = makeTestState()
    const offlineOffice = bareOffice(offline)
    const cathedral = injectUnit(offline, { kind: 'cathedral', floor: 0, x: 10, width: 30, storeys: 2, offline: true })
    expect(evalBreakdown(offline, offlineOffice).landmarkBonus).toBe(0)
    cathedral.offline = false
    cathedral.flags.noRoute = true
    expect(evalBreakdown(offline, offlineOffice).landmarkBonus).toBe(0)
    offline.units = offline.units.filter((unit) => unit.id !== cathedral.id)
    expect(evalBreakdown(offline, offlineOffice).landmarkBonus).toBe(0)

    const unreachable = makeTestState()
    placeSlabRow(unreachable, 0, 0, 40)
    placeSlabRow(unreachable, 1, 0, 40)
    placeSlabRow(unreachable, 2, 0, 40)
    const unreachableOffice = bareOffice(unreachable)
    injectUnit(unreachable, { kind: 'cathedral', floor: 2, x: 0, width: 30, storeys: 2 })
    expect(evalBreakdown(unreachable, unreachableOffice).landmarkBonus).toBe(0)
  })

  it('grants a clear Niagara falls view from either bank above or below the lobby', () => {
    const state = makeTestState({ mapId: 'niagara-falls' })
    const leftAbove = injectUnit(state, { kind: 'officeS', floor: 5, x: 160, width: 6, storeys: 1 })
    const rightBelow = injectUnit(state, { kind: 'restaurant', floor: -12, x: 290, width: 10, storeys: 1 })

    expect(evalBreakdown(state, leftAbove).fallsViewBonus).toBe(TUNING.evalWeights.fallsViewBonus)
    expect(evalBreakdown(state, rightBelow).fallsViewBonus).toBe(TUNING.evalWeights.fallsViewBonus)
  })

  it('withholds the falls view when blocked, distant, or on the city map', () => {
    const blocked = makeTestState({ mapId: 'niagara-falls' })
    const receiver = injectUnit(blocked, { kind: 'officeS', floor: -5, x: 160, width: 6, storeys: 1 })
    injectUnit(blocked, { kind: 'restaurant', floor: -5, x: 175, width: 10, storeys: 1 })
    expect(evalBreakdown(blocked, receiver).fallsViewBonus).toBe(0)

    const distant = makeTestState({ mapId: 'niagara-falls' })
    const farOffice = injectUnit(distant, { kind: 'officeS', floor: 3, x: 0, width: 6, storeys: 1 })
    expect(evalBreakdown(distant, farOffice).fallsViewBonus).toBe(0)

    const city = makeTestState()
    const cityOffice = injectUnit(city, { kind: 'officeS', floor: 3, x: 160, width: 6, storeys: 1 })
    expect(evalBreakdown(city, cityOffice).fallsViewBonus).toBe(0)
  })

  it('conference center is tower-wide for offices only; event space for hotel rooms only', () => {
    const state = makeTestState()
    const office = bareOffice(state)
    const apt = bareApt(state, 100)
    const hotel = injectUnit(state, { kind: 'hotel1p', floor: 50, x: 0, width: 4, storeys: 1 })
    injectUnit(state, { kind: 'conferenceCenter', floor: 90, x: 300, width: 24, storeys: 2 })
    injectUnit(state, { kind: 'eventSpace', floor: 95, x: 300, width: 30, storeys: 2 })
    expect(evalUnit(state, office)).toBe(65)
    expect(evalUnit(state, apt)).toBe(60)
    expect(evalUnit(state, hotel)).toBe(65)
  })

  it('affinity needs ≥3 same-group units on the floor', () => {
    const two = makeTestState()
    const a = bareOffice(two, 0)
    bareOffice(two, 10)
    expect(evalUnit(two, a)).toBe(60)

    const three = makeTestState()
    const b = bareOffice(three, 0)
    bareOffice(three, 10)
    bareOffice(three, 20)
    expect(evalUnit(three, b)).toBe(65)
  })

  it('amenity bonus requires the amenity to be reachable, not just in geometric range', () => {
    const evalWithFitness = (connected: boolean): number => {
      const state = makeTestState()
      placeSlabRow(state, 0, 0, 40)
      placeSlabRow(state, 1, 0, 40)
      placeSlabRow(state, 2, 0, 40)
      const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1 })
      place(state, 'restroom', 0, 7) // isolate from the restroom comfort drag
      // Δ2 floors, gap 10 (> fitness's 8-tile noise radius, ≤ 20 amenity radius).
      injectUnit(state, { kind: 'fitness', floor: 2, x: 15, width: 12, storeys: 1 })
      if (connected) {
        placeShaft(state, 'standard', 34, 0, 2)
      }
      return evalUnit(state, office)
    }
    expect(evalWithFitness(false)).toBe(60) // in range but no elevator up → no bonus
    expect(evalWithFitness(true)).toBe(64) // reachable via the shaft → +4 fitness
  })

  it('affinity excludes same-floor neighbors in a different walkable segment', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 10) // segment A
    placeSlabRow(state, 0, 20, 40) // segment B (split from A by a gap)
    const a = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1 })
    place(state, 'restroom', 0, 6) // isolate `a` from the restroom comfort drag
    injectUnit(state, { kind: 'officeS', floor: 0, x: 22, width: 6, storeys: 1 }) // segment B
    injectUnit(state, { kind: 'officeS', floor: 0, x: 30, width: 6, storeys: 1 }) // segment B
    // 3 offices on the floor, but only `a` shares segment A → no "good neighbors".
    expect(evalUnit(state, a)).toBe(60)
  })

  it('super lobby bonus follows lobby height', () => {
    const h1 = makeTestState({ lobbyHeight: 1 })
    expect(evalUnit(h1, bareOffice(h1))).toBe(60)
    const h2 = makeTestState({ lobbyHeight: 2 })
    expect(evalUnit(h2, bareOffice(h2))).toBe(63)
    const h3 = makeTestState({ lobbyHeight: 3 })
    expect(evalUnit(h3, bareOffice(h3))).toBe(66)
  })

  it('glass elevator proximity grants +3 within 8 tiles on a spanned floor', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 9)
    const office = bareOffice(state, 0)
    place(state, 'restroom', 0, 6) // adjacent restroom → no comfort drag, isolate glass
    placeShaft(state, 'glass', 10, 0, 5) // columns 10–11, gap 5 from office
    expect(evalUnit(state, office)).toBe(63)

    const far = makeTestState()
    setStars(far, 4, 4)
    placeSlabRow(far, 0, 0, 30)
    const office2 = bareOffice(far, 0)
    place(far, 'restroom', 0, 6) // adjacent restroom → no comfort drag
    placeShaft(far, 'glass', 31, 0, 5) // gap 26 > 8
    expect(evalUnit(far, office2)).toBe(60)
  })

  it('grants a residential live/work bonus when occupied office seats meet the resident share', () => {
    const state = makeTestState()
    const apt = bareApt(state, 0)
    injectUnit(state, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: true })
    injectUnit(state, {
      kind: 'apt2br', floor: 0, x: 20, width: 8, storeys: 1,
      occupied: true, population: { low: 0, med: 5, high: 0, vip: 0 },
    })

    const breakdown = evalBreakdown(state, apt)
    expect(breakdown.liveWorkBonus).toBe(TUNING.evalWeights.liveWorkBonus)
    expect(breakdown.score).toBe(60 + TUNING.evalWeights.liveWorkBonus)
  })

  it('applies live/work to vacant residential units but not offices', () => {
    const state = makeTestState()
    const apt = bareApt(state, 0)
    const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: true })

    expect(evalBreakdown(state, apt).liveWorkBonus).toBe(TUNING.evalWeights.liveWorkBonus)
    expect(evalBreakdown(state, office).liveWorkBonus).toBe(0)
  })

  it('withholds the live/work bonus when offices are vacant or the job share is too low', () => {
    const noOccupiedOffice = makeTestState()
    const aptA = bareApt(noOccupiedOffice, 0)
    injectUnit(noOccupiedOffice, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: false })
    expect(evalBreakdown(noOccupiedOffice, aptA).liveWorkBonus).toBe(0)

    const shareUnmet = makeTestState()
    const aptB = bareApt(shareUnmet, 0)
    injectUnit(shareUnmet, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: true })
    injectUnit(shareUnmet, {
      kind: 'aptPenthouse', floor: 0, x: 20, width: 16, storeys: 1,
      occupied: true, population: { low: 0, med: 0, high: 6, vip: 0 },
    })
    injectUnit(shareUnmet, {
      kind: 'aptPenthouse', floor: 0, x: 40, width: 16, storeys: 1,
      occupied: true, population: { low: 0, med: 0, high: 6, vip: 0 },
    })
    injectUnit(shareUnmet, {
      kind: 'aptPenthouse', floor: 0, x: 60, width: 16, storeys: 1,
      occupied: true, population: { low: 0, med: 0, high: 6, vip: 0 },
    })

    expect(evalBreakdown(shareUnmet, aptB).liveWorkBonus).toBe(0)
  })

  it('noise scales with sensitivity and floor propagation', () => {
    // fastfood level 12 radius 8, gap 1 → exposure 10.5 per source.
    const sameFloor = makeTestState()
    const apt = bareApt(sameFloor, 0)
    injectUnit(sameFloor, { kind: 'fastfood', floor: 0, x: 4, width: 12, storeys: 1 })
    expect(evalUnit(sameFloor, apt)).toBeCloseTo(60 - 21) // ×2.0 sensitivity

    const oneUp = makeTestState()
    const apt1 = bareApt(oneUp, 0)
    injectUnit(oneUp, { kind: 'fastfood', floor: 1, x: 4, width: 12, storeys: 1 })
    expect(evalUnit(oneUp, apt1)).toBeCloseTo(60 - 10.5) // x0.5 propagation

    const twoUp = makeTestState()
    const apt2 = bareApt(twoUp, 0)
    injectUnit(twoUp, { kind: 'fastfood', floor: 2, x: 4, width: 12, storeys: 1 })
    expect(evalUnit(twoUp, apt2)).toBeCloseTo(60 - 5.25) // x0.25 propagation

    const threeUp = makeTestState()
    const apt3 = bareApt(threeUp, 0)
    injectUnit(threeUp, { kind: 'fastfood', floor: 3, x: 4, width: 12, storeys: 1 })
    expect(evalUnit(threeUp, apt3)).toBe(60) // out of propagation range

    const officeState = makeTestState()
    const office1 = bareOffice(officeState, 0) // sensitivity ×0.5
    injectUnit(officeState, { kind: 'fastfood', floor: 0, x: 6, width: 12, storeys: 1 })
    expect(evalUnit(officeState, office1)).toBeCloseTo(60 - 5.25)
  })

  it('noise penalty caps at 30', () => {
    const state = makeTestState()
    const apt = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 20, width: 4, storeys: 1 })
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 8, width: 12, storeys: 1 }) // gap 1 → 21
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 24, width: 12, storeys: 1 }) // gap 1 → 21
    injectUnit(state, { kind: 'fastfood', floor: 1, x: 20, width: 12, storeys: 1 }) // gap 0, ×0.5 → 12
    expect(evalUnit(state, apt)).toBe(30)
  })

  it('congestion reads the nearest serving shaft PEAK wait, capped at 25', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    const office = bareOffice(state, 0)
    place(state, 'restroom', 0, 8) // adjacent restroom → no comfort drag, isolate congestion
    const shaftId = placeShaft(state, 'standard', 20, 0, 5)
    const shaft = state.shafts.find((s) => s.id === shaftId)!

    // Eval reads the daily PEAK, not the live avg — a low avg with a high peak
    // (jammed at rush, calm now) must still penalize.
    const { congestionFactor, congestionCap } = TUNING.evalWeights
    shaft.stats.avgWaitGameMin = 0
    shaft.stats.peakWaitGameMin = 10
    expect(evalUnit(state, office)).toBe(60 - 10 * congestionFactor)
    shaft.stats.peakWaitGameMin = 300 // way over the cap
    expect(evalUnit(state, office)).toBe(60 - congestionCap)
  })

  it('congestion uses the least-congested serving shaft (a relief elevator helps)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const office = bareOffice(state, 0)
    place(state, 'restroom', 0, 7) // isolate from the restroom drag
    const jammedId = placeShaft(state, 'standard', 20, 0, 5)
    const reliefId = placeShaft(state, 'standard', 30, 0, 5)
    state.shafts.find((s) => s.id === jammedId)!.stats.peakWaitGameMin = 20
    state.shafts.find((s) => s.id === reliefId)!.stats.peakWaitGameMin = 2

    // Both serve floor 0 → riders take the calm one; penalty tracks the min peak.
    expect(evalUnit(state, office)).toBe(60 - 2 * TUNING.evalWeights.congestionFactor)
  })

  it('occupancyPass resets every shaft peak wait after evaluating (fresh 24h window)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    bareOffice(state, 0)
    const shaftId = placeShaft(state, 'standard', 20, 0, 5)
    const shaft = state.shafts.find((s) => s.id === shaftId)!
    shaft.stats.avgWaitGameMin = 4
    shaft.stats.peakWaitGameMin = 20 // had boardings this window

    occupancyPass(state, [])

    expect(shaft.stats.peakWaitGameMin).toBe(0) // reset for the next window
    expect(shaft.stats.avgWaitGameMin).toBe(4) // active shaft: live EMA untouched
  })

  it('occupancyPass decays a stale avg wait for a shaft that saw no boardings', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 30)
    bareOffice(state, 0)
    const shaftId = placeShaft(state, 'standard', 20, 0, 5)
    const shaft = state.shafts.find((s) => s.id === shaftId)!
    shaft.stats.avgWaitGameMin = 10
    shaft.stats.peakWaitGameMin = 0 // idle: no boardings this window

    occupancyPass(state, [])

    // Relaxed toward 0 by one idle step so phantom congestion clears over days.
    expect(shaft.stats.avgWaitGameMin).toBeCloseTo(10 * (1 - TUNING.elevators.idleWaitDecayPerPass))
    expect(shaft.stats.peakWaitGameMin).toBe(0)
  })

  it('restroom comfort is a graded office drag: adjacent → 0, distant → partial, none → full', () => {
    const evalWithRestroomAt = (restroomX: number | null): number => {
      const state = makeTestState()
      placeSlabRow(state, 0, 0, 40)
      const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1 })
      if (restroomX !== null) {
        place(state, 'restroom', 0, restroomX)
      }
      return evalUnit(state, office)
    }
    const { restroomComfortPenalty: full, restroomComfortFreeTiles: free } = TUNING.evalWeights
    const range = TUNING.grid.restroomRangeTiles
    expect(range).toBe(32)
    expect(evalWithRestroomAt(6)).toBe(60) // gap 1 ≤ free → no drag
    expect(evalWithRestroomAt(null)).toBe(60 - full) // none on the floor → full drag
    // gap 15 (office 0–5, restroom 20–23) grades between free and range.
    expect(evalWithRestroomAt(20)).toBeCloseTo(60 - (full * (15 - free)) / (range - free))
  })

  it('leases a routable office with no restroom (soft penalty, not a hard block)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40) // floor 0 = lobby floor → routable
    const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1, rentTier: 'low' })

    occupancyPass(state, [])

    expect(office.flags.noRestroom).toBe(true) // flag still set (drives incidents + UI)
    expect(office.occupied).toBe(true) // …but it leased anyway — soft drag, not a block
  })

  it('applies dirty, offline, and trash penalties', () => {
    const state = makeTestState()
    const dirtyRoom = injectUnit(state, { kind: 'hotel1p', floor: 10, x: 0, width: 4, storeys: 1, dirty: true })
    expect(evalUnit(state, dirtyRoom)).toBe(45)

    const offline = injectUnit(state, { kind: 'officeS', floor: 20, x: 0, width: 6, storeys: 1, offline: true })
    expect(evalUnit(state, offline)).toBe(50)

    const nearTrash = bareApt(state, 100, 30)
    injectUnit(state, {
      kind: 'trashRoom', floor: 30, x: 110, width: 6, storeys: 1,
      flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: true },
    })
    expect(evalUnit(state, nearTrash)).toBe(50)
  })

  it('clamps at 0', () => {
    const state = makeTestState()
    const apt = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 20, width: 4, storeys: 1, dirty: true, offline: true })
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 8, width: 12, storeys: 1 })
    injectUnit(state, { kind: 'fastfood', floor: 1, x: 20, width: 12, storeys: 1 })
    injectUnit(state, {
      kind: 'fastfood', floor: 0, x: 24, width: 12, storeys: 1,
      flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: true },
    })
    // 60 − 30 (noise cap) − 10 (trash) − 15 (dirty) − 10 (incident) = −5 → 0.
    expect(evalUnit(state, apt)).toBe(0)
  })
})

describe('occupancyPass — leasing', () => {
  function officeTower(): { state: EngineState; officeId: number } {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const officeId = place(state, 'officeS', 0, 0)
    place(state, 'restroom', 0, 10)
    return { state, officeId }
  }

  it('leases a routable office on a weekday and fills population from the tier mix', () => {
    const { state, officeId } = officeTower()
    const events: EngineEvent[] = []
    occupancyPass(state, events)

    const office = state.units.find((u) => u.id === officeId)!
    expect(office.occupied).toBe(true)
    expect(events).toContainEqual({ type: 'unitLeased', unitId: officeId })
    const pop = office.population
    expect(pop.low + pop.med + pop.high + pop.vip).toBe(4) // capacity
    expect(pop.vip).toBe(0)
    expect(office.evalScore).toBeGreaterThanOrEqual(50)
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const { state, officeId } = officeTower()
      occupancyPass(state, [])
      return state.units.find((u) => u.id === officeId)!.population
    }
    expect(run()).toEqual(run())
  })

  it('a high rent tier only draws med/high tenants', () => {
    const { state, officeId } = officeTower()
    const office = state.units.find((u) => u.id === officeId)!
    office.rentTier = 'low' // threshold 35, eval 60 → leases
    occupancyPass(state, [])
    expect(office.occupied).toBe(true)
    expect(office.population.high).toBe(0) // low mix has no high tier

    office.occupied = false
    office.population = { low: 0, med: 0, high: 0, vip: 0 }
    office.rentTier = 'high'
    occupancyPass(state, [])
    expect(office.occupied).toBe(false) // eval 60 < high threshold 65
  })

  it('offices lease on weekdays only; apartments lease any day', () => {
    const { state, officeId } = officeTower()
    const aptId = place(state, 'aptStudio', 0, 20)
    state.clock.day = 6 // weekend
    occupancyPass(state, [])
    expect(state.units.find((u) => u.id === officeId)!.occupied).toBe(false)
    expect(state.units.find((u) => u.id === aptId)!.occupied).toBe(true)
  })

  it('noRestroom blocks office leasing', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const officeId = place(state, 'officeS', 0, 0) // no restroom anywhere
    occupancyPass(state, [])
    const office = state.units.find((u) => u.id === officeId)!
    expect(office.flags.noRestroom).toBe(true)
    expect(office.occupied).toBe(false)
  })

  it('noRoute stub: upper floors need an enabled shaft stop on the segment', () => {
    const state = makeTestState()
    for (let f = 0; f <= 3; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    const aptId = place(state, 'aptStudio', 3, 0)
    occupancyPass(state, [])
    const apt = state.units.find((u) => u.id === aptId)!
    expect(apt.flags.noRoute).toBe(true)
    expect(apt.occupied).toBe(false)

    placeShaft(state, 'standard', 10, 0, 5) // stops on slabbed floors 0–3
    occupancyPass(state, [])
    expect(apt.flags.noRoute).toBe(false)
    expect(apt.occupied).toBe(true)
  })

  it('commerce operates when routable instead of leasing', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 20)
    for (let f = 1; f <= 3; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    const groundShop = place(state, 'shop', 0, 0)
    const strandedShop = place(state, 'shop', 3, 10)
    const events: EngineEvent[] = []
    occupancyPass(state, events)
    expect(state.units.find((u) => u.id === groundShop)!.occupied).toBe(true)
    expect(state.units.find((u) => u.id === strandedShop)!.occupied).toBe(false)
    expect(events.filter((e) => e.type === 'unitLeased')).toHaveLength(0)
  })
})

describe('occupancyPass — vacancy', () => {
  function noisyOccupiedApt(floor = 0): { state: EngineState; apt: Unit } {
    const state = makeTestState()
    for (let f = 0; f <= floor; f++) {
      placeSlabRow(state, f, 0, 20)
    }
    const apt = injectUnit(state, {
      kind: 'aptStudio', floor, x: 0, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    injectUnit(state, { kind: 'fastfood', floor, x: 4, width: 12, storeys: 1 })
    return { state, apt } // eval 39 < avg threshold 50
  }

  it('vacates after 3 consecutive low-eval passes with the dominant reason', () => {
    const { state, apt } = noisyOccupiedApt()
    const events: EngineEvent[] = []
    occupancyPass(state, events)
    occupancyPass(state, events)
    expect(apt.occupied).toBe(true)
    expect(apt.lowEvalDays).toBe(2)

    occupancyPass(state, events)
    expect(apt.occupied).toBe(false)
    expect(apt.vacancyReason).toBe('tooNoisy') // noise 21 ≥ 15
    expect(apt.population).toEqual({ low: 0, med: 0, high: 0, vip: 0 })
    expect(events).toContainEqual({
      type: 'unitVacated',
      unitId: apt.id,
      unitKind: apt.kind,
      floor: apt.floor,
      reason: 'tooNoisy',
    })
  })

  it('a recovered eval resets the streak', () => {
    const { state, apt } = noisyOccupiedApt()
    occupancyPass(state, [])
    occupancyPass(state, [])
    state.units = state.units.filter((u) => u.kind !== 'fastfood') // noise source demolished
    occupancyPass(state, [])
    expect(apt.occupied).toBe(true)
    expect(apt.lowEvalDays).toBe(0)
  })

  it('noRoute outranks tooNoisy in the vacancy reason', () => {
    const { state, apt } = noisyOccupiedApt(3) // floor 3, no shaft → noRoute
    const events: EngineEvent[] = []
    occupancyPass(state, events)
    occupancyPass(state, events)
    occupancyPass(state, events)
    expect(apt.occupied).toBe(false)
    expect(apt.vacancyReason).toBe('noRoute')
  })

  it('rentTooHigh when the eval clears avg but not the unit rent tier', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 20)
    const office = injectUnit(state, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, rentTier: 'high', population: { low: 0, med: 2, high: 2, vip: 0 },
    })
    injectUnit(state, { kind: 'restroom', floor: 0, x: 10, width: 4, storeys: 1 })
    // eval 60: ≥ avg 50 but < high 65 → low-eval streak with reason rentTooHigh.
    occupancyPass(state, [])
    occupancyPass(state, [])
    occupancyPass(state, [])
    expect(office.occupied).toBe(false)
    expect(office.vacancyReason).toBe('rentTooHigh')
  })
})

describe('weeklyStressPass', () => {
  it('vacates at the tolerance-scaled mark threshold and resets marks', () => {
    const state = makeTestState()
    const avgApt = injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 0, width: 4, storeys: 1,
      occupied: true, rentTier: 'avg', stressMarks: 3, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    const lowApt = injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1,
      occupied: true, rentTier: 'low', stressMarks: 4, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    const events: EngineEvent[] = []
    weeklyStressPass(state, events)

    expect(avgApt.occupied).toBe(false) // threshold ceil(3 × 1.0) = 3
    expect(lowApt.occupied).toBe(true) // threshold ceil(3 × 1.5) = 5
    expect(avgApt.stressMarks).toBe(0)
    expect(lowApt.stressMarks).toBe(0)
    expect(events.filter((e) => e.type === 'unitVacated')).toHaveLength(1)
  })
})
