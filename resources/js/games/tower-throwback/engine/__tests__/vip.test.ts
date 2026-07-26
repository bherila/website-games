import type { EngineEvent, EngineState, VipRecord } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { vipDisplayName, vipReportLine, vipVisitIdForTarget } from '../../vipFlavor'
import { weeklyStressPass } from '../occupancy'
import { stepPeople } from '../people'
import { validatePlacement } from '../placement'
import { applyVisitEvent, createVisitScore, stepVipMinute, stepVips } from '../vip'
import { injectUnit, makeTestState, placeSlabRow, setStars } from './testState'

/** Advance minute-by-minute, keeping the clock in sync with the vip/people ticks. */
function drive(state: EngineState, events: EngineEvent[], minutes: number): void {
  for (let i = 0; i < minutes; i++) {
    let m = state.clock.minute + 1
    if (m >= 1440) {
      m = 0
      state.clock.day += 1
    }
    state.clock.minute = m
    stepVipMinute(state, m, events)
    stepPeople(state, 1, events)
  }
}

function driveUntil(state: EngineState, events: EngineEvent[], predicate: () => boolean, maxMinutes: number): void {
  for (let i = 0; i < maxMinutes && !predicate(); i++) {
    drive(state, events, 1)
  }
}

function comparableEngineState(state: EngineState): string {
  return JSON.stringify({
    mapId: state.mapId,
    seed: state.seed,
    rngState: state.rng.state(),
    clock: state.clock,
    speed: state.speed,
    funds: state.funds,
    loans: state.loans,
    lobbyHeight: state.lobbyHeight,
    star: state.star,
    maxStarReached: state.maxStarReached,
    towerAchieved: state.towerAchieved,
    units: state.units,
    shafts: state.shafts,
    people: state.people,
    vips: state.vips,
    activeBombThreat: state.activeBombThreat,
    activeRequest: state.activeRequest,
    ledgerToday: state.ledgerToday,
    ledgerHistory: state.ledgerHistory,
    milestonesEarned: state.milestonesEarned,
    pendingLoanPrompt: state.pendingLoanPrompt,
    structureVersion: state.structureVersion,
    nextId: state.nextId,
  })
}

function formatVipEventText(events: EngineEvent[]): string[] {
  const lines: string[] = []
  for (const event of events) {
    switch (event.type) {
      case 'vipArrived':
      case 'vipMovedIn':
        lines.push(vipDisplayName(event.target, vipVisitIdForTarget(event.target)))
        break
      case 'vipResult':
      case 'vipMovedOut':
        lines.push(vipDisplayName(event.target, vipVisitIdForTarget(event.target)))
        if (event.report[0]) {
          lines.push(vipReportLine(event.target, vipVisitIdForTarget(event.target), event.report[0]))
        }
        break
      default:
        break
    }
  }
  return lines
}

/** Healthy walk-only tour tower: pop ≥ 300, occupied offices, one amenity. */
function tourTower(): EngineState {
  const state = makeTestState()
  state.clock.minute = 7 * 60
  placeSlabRow(state, 0, 0, 120)
  injectUnit(state, {
    kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1,
    occupied: true, population: { low: 300, med: 0, high: 0, vip: 0 }, evalScore: 80,
  })
  injectUnit(state, {
    kind: 'officeS', floor: 0, x: 20, width: 6, storeys: 1,
    occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 }, evalScore: 70,
  })
  injectUnit(state, { kind: 'fitness', floor: 0, x: 60, width: 12, storeys: 1, occupied: true })
  injectUnit(state, { kind: 'aptStudio', floor: 0, x: 40, width: 4, storeys: 1, evalScore: 55 })
  return state
}

describe('visit scoring (rubric math)', () => {
  it('applies each deduction and caps the amenity bonus', () => {
    const visit = createVisitScore()
    applyVisitEvent(visit, { type: 'elevatorWait', minutes: 9 }) // 4 extra min × −3 = −12
    applyVisitEvent(visit, { type: 'noiseExposure' }) // −10
    applyVisitEvent(visit, { type: 'dirtySuite' }) // −20
    applyVisitEvent(visit, { type: 'trashSight' }) // −10
    for (const kind of ['fitness', 'pool', 'spa', 'fancyRestaurant'] as const) {
      applyVisitEvent(visit, { type: 'amenity', kind }) // +5 ×3, 4th capped
    }
    applyVisitEvent(visit, { type: 'amenity', kind: 'fitness' }) // repeat kind ignored
    expect(visit.score).toBe(100 - 12 - 10 - 20 - 10 + 15)
    expect(visit.report).toHaveLength(4)
    expect(visit.report[0]).toContain('Waited 9 min')
  })

  it('waits inside the grace window cost nothing', () => {
    const visit = createVisitScore()
    applyVisitEvent(visit, { type: 'elevatorWait', minutes: TUNING.elevators.waitGraceMin })
    expect(visit.score).toBe(100)
    expect(visit.report).toHaveLength(0)
  })
})

describe('arming', () => {
  it('arms at the population threshold and arrives next day at 10:00', () => {
    const state = tourTower()
    const events: EngineEvent[] = []
    stepVips(state, events)
    expect(state.vips).toHaveLength(1)
    expect(state.vips[0]).toMatchObject({ target: 2, state: 'pending' })

    driveUntil(state, events, () => events.some((e) => e.type === 'vipArrived'), 2000)
    expect(events).toContainEqual({ type: 'vipArrived', target: 2 })
    expect(state.clock.day).toBe(2)
    expect(state.people.some((p) => p.vip)).toBe(true)
  })

  it('does not arm below the threshold', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    stepVips(state, [])
    expect(state.vips).toHaveLength(0)
  })
})

describe('tour visit', () => {
  it('success grants the star, bonuses, milestone, and a golden move-in', () => {
    const state = tourTower()
    const events: EngineEvent[] = []
    stepVips(state, events)
    driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)

    const result = events.find((e) => e.type === 'vipResult')
    expect(result).toMatchObject({ type: 'vipResult', success: true, target: 2 })
    expect(state.star).toBe(2)
    expect(state.maxStarReached).toBe(2)
    expect(events).toContainEqual(expect.objectContaining({ type: 'starUp', star: 2 }))
    expect(events.filter((e) => e.type === 'milestone')).toHaveLength(1) // no double-fire

    // Bonuses: star-up 100k×2 + VIP success 50k×2, both on the ledger.
    expect(state.ledgerToday.lines['bonus.star']).toBe(200_000)
    expect(state.ledgerToday.lines['bonus.vip']).toBe(100_000)

    // Golden move-in: target 2 → the vacant studio.
    const moveIn = events.find((e) => e.type === 'vipMovedIn')
    const apt = state.units.find((u) => u.kind === 'aptStudio')!
    expect(moveIn).toEqual({ type: 'vipMovedIn', target: 2, unitId: apt.id })
    expect(apt.occupied).toBe(true)
    expect(apt.population.vip).toBe(1)
    expect(state.vips[0]).toMatchObject({ state: 'resident', unitId: apt.id, satisfaction: TUNING.vip.residentStart })
  })

  it('an unroutable representative stop auto-fails with report and cooldown, then re-arms', () => {
    const state = tourTower()
    for (let f = 1; f <= 5; f++) {
      placeSlabRow(state, f, 0, 40)
    }
    // Highest-eval occupied unit sits on an unreachable floor — no shaft exists.
    injectUnit(state, {
      kind: 'officeS', floor: 5, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 }, evalScore: 99,
    })
    const events: EngineEvent[] = []
    stepVips(state, events)
    driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)

    const result = events.find((e) => e.type === 'vipResult')
    expect(result).toMatchObject({ type: 'vipResult', success: false })
    if (result?.type === 'vipResult') {
      expect(result.report.join(' ')).toContain('route')
      expect(result.bonus).toBe(TUNING.economy.vipFailBonus)
    }
    expect(state.star).toBe(1)
    const record = state.vips[0]!
    expect(record.state).toBe('pending')
    expect(record.cooldownUntilDay).toBe(state.clock.day + TUNING.vip.cooldownDays)

    // Cooldown elapses → the visit re-arms and a new arrival happens.
    state.clock.day += TUNING.vip.cooldownDays
    const rearm: EngineEvent[] = []
    stepVips(state, rearm)
    driveUntil(state, rearm, () => rearm.some((e) => e.type === 'vipArrived'), 2500)
    expect(rearm).toContainEqual({ type: 'vipArrived', target: 2 })
  })
})

describe('suite stay (targets 4/5)', () => {
  function suiteTower(withSuite: boolean): EngineState {
    const state = makeTestState()
    state.clock.minute = 7 * 60
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 160)
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1,
      occupied: true, population: { low: 5000, med: 0, high: 0, vip: 0 }, evalScore: 80,
    })
    if (withSuite) {
      injectUnit(state, { kind: 'hotelReception', floor: 0, x: 20, width: 10, storeys: 1 })
      injectUnit(state, { kind: 'hotelSuite', floor: 0, x: 32, width: 10, storeys: 1 })
    }
    // Quiet amenities only (theater self-noise ≥ threshold would deduct).
    injectUnit(state, { kind: 'fancyRestaurant', floor: 0, x: 60, width: 12, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'spa', floor: 0, x: 90, width: 12, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'pool', floor: 0, x: 120, width: 20, storeys: 2, occupied: true })
    return state
  }

  it('auto-fails without a clean vacant suite', () => {
    const state = suiteTower(false)
    const events: EngineEvent[] = []
    stepVips(state, events)
    driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 2000)
    const result = events.find((e) => e.type === 'vipResult')
    expect(result).toMatchObject({ type: 'vipResult', success: false, target: 4 })
    if (result?.type === 'vipResult') {
      expect(result.report[0]).toContain('suite')
    }
    expect(state.star).toBe(3)
  })

  it('dirty-at-checkin deducts 20; capped amenity bonus still lands the star', () => {
    const state = suiteTower(true)
    const suite = state.units.find((u) => u.kind === 'hotelSuite')!
    const events: EngineEvent[] = []
    stepVips(state, events)
    driveUntil(state, events, () => events.some((e) => e.type === 'vipArrived'), 2000)
    suite.dirty = true // housekeeping missed it between planning and arrival

    driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)
    const result = events.find((e) => e.type === 'vipResult')
    // 100 − 20 (dirty) + 15 (3 amenities capped) = 95 ≥ 70 → success.
    expect(result).toMatchObject({ type: 'vipResult', success: true, target: 4, score: 95 })
    expect(state.star).toBe(4)
    expect(suite.dirty).toBe(true) // checkout dirties it again
    expect(suite.occupied).toBe(false)
  })
})

describe('venue-noise exemption', () => {
  function noisyTourTower(officeInsideNoiseZone: boolean): EngineState {
    const state = makeTestState()
    state.clock.minute = 7 * 60
    placeSlabRow(state, 0, 0, 120)
    // Event space noise is 18 (radius 14): a stop within 2 tiles of it sits in
    // a ≥15 zone. The office is either right at its edge or far away.
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: officeInsideNoiseZone ? 71 : 110, width: 6, storeys: 1,
      occupied: true, population: { low: 300, med: 0, high: 0, vip: 0 }, evalScore: 80,
    })
    injectUnit(state, { kind: 'eventSpace', floor: 0, x: 40, width: 30, storeys: 1, occupied: true })
    return state
  }

  function visitScore(state: EngineState): number {
    const events: EngineEvent[] = []
    stepVips(state, events)
    driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)
    const result = events.find((e) => e.type === 'vipResult')
    return result?.type === 'vipResult' ? result.score : -1
  }

  it('a noisy venue does not ding its own visitors (expected ambiance)', () => {
    // Only in-zone stop is the event space itself (dist 0 → exposure 18 ≥ 15),
    // and its dominant source IS the venue → exempt. No amenity kinds → 100.
    expect(visitScore(noisyTourTower(false))).toBe(100)
  })

  it("a quiet stop inside another venue's noise zone still dings", () => {
    // Office 2 tiles from the event space edge: exposure 18×(1−2/14) ≈ 15.4 ≥ 15,
    // dominant source is the event space, but the VIP is visiting the office → −10.
    expect(visitScore(noisyTourTower(true))).toBe(90)
  })
})

describe('resident satisfaction', () => {
  function residentSetup(): { state: EngineState; record: VipRecord; home: ReturnType<typeof injectUnit> } {
    const state = makeTestState()
    setStars(state, 2, 2)
    placeSlabRow(state, 0, 0, 60)
    const home = injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1,
      occupied: true, population: { low: 0, med: 0, high: 0, vip: 1 }, evalScore: 40,
    })
    const record: VipRecord = {
      target: 2, state: 'resident', satisfaction: TUNING.vip.residentStart,
      unitId: home.id, cooldownUntilDay: null, lastReport: [],
    }
    state.vips.push(record)
    return { state, record, home }
  }

  it('decays on a bad home, moves out, loses the star — but building keeps maxStarReached', () => {
    const { state, record, home } = residentSetup()
    const events: EngineEvent[] = []
    for (let week = 0; week < 3; week++) {
      home.stressMarks = 2 // −10 (low eval) −5 (stress) per week: 80→65→50→35
      weeklyStressPass(state, events)
    }
    expect(record.state).toBe('movedOut')
    expect(record.unitId).toBeNull()
    expect(home.occupied).toBe(false)
    expect(events).toContainEqual(expect.objectContaining({ type: 'vipMovedOut', target: 2 }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'starLost', star: 1 }))
    expect(state.star).toBe(1)
    expect(state.maxStarReached).toBe(2)
    // Demotion never restricts building: a 2★ item still validates.
    expect(validatePlacement(state, { type: 'place', kind: 'officeM', floor: 0, x: 30 }).ok).toBe(true)

    // Re-earnable: population threshold + cooldown elapsed → arms target 2 again.
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 40, width: 6, storeys: 1,
      occupied: true, population: { low: 300, med: 0, high: 0, vip: 0 },
    })
    state.clock.day += TUNING.vip.cooldownDays
    stepVips(state, [])
    expect(record.state).toBe('pending')
  })

  it('a good home raises satisfaction', () => {
    const { state, record, home } = residentSetup()
    home.evalScore = 90
    record.satisfaction = 80
    weeklyStressPass(state, [])
    expect(record.satisfaction).toBe(80 + TUNING.vip.residentGoodWeekDelta)
  })

  it('the weekly stress vacancy pass never evicts a VIP home', () => {
    const { state, home } = residentSetup()
    home.stressMarks = 99
    weeklyStressPass(state, [])
    expect(home.occupied).toBe(true) // only the VIP system moves VIPs out
  })
})

describe('deferred move-in', () => {
  it('retries at the 08:00 pass until a unit frees up', () => {
    const state = makeTestState()
    setStars(state, 2, 2)
    placeSlabRow(state, 0, 0, 60)
    const record: VipRecord = {
      target: 2, state: 'resident', satisfaction: TUNING.vip.residentStart,
      unitId: null, cooldownUntilDay: null, lastReport: [],
    }
    state.vips.push(record)

    stepVips(state, [])
    expect(record.unitId).toBeNull() // nowhere to live yet

    const apt = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 10, width: 4, storeys: 1, evalScore: 60 })
    const events: EngineEvent[] = []
    stepVips(state, events)
    expect(record.unitId).toBe(apt.id)
    expect(apt.population.vip).toBe(1)
    expect(events).toContainEqual({ type: 'vipMovedIn', target: 2, unitId: apt.id })
  })
})

describe('determinism', () => {
  it('the same seed produces the same visit outcome and event log', () => {
    const run = (): string => {
      const state = tourTower()
      const events: EngineEvent[] = []
      stepVips(state, events)
      driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)
      return JSON.stringify(events)
    }
    expect(run()).toBe(run())
  })

  it('cosmetic VIP lookup does not change the rng stream or arrival state', () => {
    const run = (formatNames: boolean): { eventLog: string; state: string; lineCount: number } => {
      const state = tourTower()
      const events: EngineEvent[] = []
      stepVips(state, events)
      driveUntil(state, events, () => events.some((e) => e.type === 'vipArrived'), 2000)
      const lines = formatNames ? formatVipEventText(events) : []

      return {
        eventLog: JSON.stringify(events),
        state: comparableEngineState(state),
        lineCount: lines.length,
      }
    }

    const control = run(false)
    const flavored = run(true)
    expect(flavored.lineCount).toBeGreaterThan(0)
    expect({ eventLog: flavored.eventLog, state: flavored.state }).toEqual({ eventLog: control.eventLog, state: control.state })
  })

  it('cosmetic VIP lookup does not change scoring, bonuses, or settled visit state', () => {
    const run = (formatNames: boolean): { result: Extract<EngineEvent, { type: 'vipResult' }>; state: string } => {
      const state = tourTower()
      const events: EngineEvent[] = []
      stepVips(state, events)
      driveUntil(state, events, () => events.some((e) => e.type === 'vipResult'), 4000)
      const lines = formatNames ? formatVipEventText(events) : []
      const result = events.find((event): event is Extract<EngineEvent, { type: 'vipResult' }> => event.type === 'vipResult')

      if (!result) {
        throw new Error('VIP result missing from deterministic scoring run')
      }
      if (formatNames && lines.length === 0) {
        throw new Error('VIP display lookup was not exercised')
      }

      return { result, state: comparableEngineState(state) }
    }

    expect(run(true)).toEqual(run(false))
  })
})
