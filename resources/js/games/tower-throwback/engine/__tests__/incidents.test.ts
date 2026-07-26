import type { BombThreatState, EngineEvent, EngineState, Rng, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { acceptLoan, settleMidnight } from '../economy'
import { createEngineState, stepEngine } from '../engine'
import {
  bombThreatP,
  fireDispatchCost,
  fireIgnitionP,
  generateRequest,
  pestControl,
  repairUnit,
  requestEvalBonus,
  resolveBombThreat,
  respondToFire,
  stepIncidentMinute,
  stepIncidents,
} from '../incidents'
import { evalUnit } from '../occupancy'
import { injectUnit, makeTestState, placeSlabRow, setStars } from './testState'

function injectThreat(state: EngineState, floor: number, x: number): BombThreatState {
  const threat: BombThreatState = {
    kind: 'bombThreat',
    floor,
    x,
    sweepRemainingMin: null,
    ransom: TUNING.incidents.ransomPerStar * state.star,
  }
  state.activeBombThreat = threat
  return threat
}

function occupiedOffice(state: EngineState, floor: number, x: number): Unit {
  return injectUnit(state, {
    kind: 'officeS', floor, x, width: 6, storeys: 1,
    occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 }, evalScore: 60,
  })
}

function sequenceRng(...values: number[]): Rng {
  let index = 0
  return {
    next: () => values[index++] ?? 0.99,
    state: () => index,
  }
}

describe('bomb threat probability', () => {
  it('follows the formula and caps at 3%', () => {
    const small = makeTestState()
    injectUnit(small, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 300, med: 0, high: 0, vip: 0 },
    })
    expect(bombThreatP(small)).toBeCloseTo(0.004 * 1 + 300 / 500_000)

    const big = makeTestState()
    setStars(big, 5, 5)
    injectUnit(big, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 100_000, med: 0, high: 0, vip: 0 },
    })
    expect(bombThreatP(big)).toBe(TUNING.incidents.bombPCap)
  })
})

describe('bomb threat resolution', () => {
  it('ransom pays star-scaled cost and clears the threat', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    const threat = injectThreat(state, 2, 30)
    expect(threat.ransom).toBe(150_000)
    const fundsBefore = state.funds
    const events: EngineEvent[] = []
    resolveBombThreat(state, 'ransom', events)

    expect(state.activeBombThreat).toBeNull()
    expect(state.funds).toBe(fundsBefore - 150_000)
    expect(state.ledgerToday.lines['incident.cost']).toBe(-150_000)
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'ransom paid' })
  })

  it('sweep duration = 30 + 4 × (Δfloors + Δtiles/10), then resolves safely', () => {
    const state = makeTestState()
    injectUnit(state, { kind: 'securityOffice', floor: 0, x: 0, width: 10, storeys: 1 })
    const threat = injectThreat(state, 5, 30)
    resolveBombThreat(state, 'sweep', [])
    // coverage = 5 floors + (30−9)/10 = 7.1 → 30 + 28.4 = 58.4 min.
    expect(threat.sweepRemainingMin).toBeCloseTo(58.4)

    const events: EngineEvent[] = []
    for (let m = 0; m < 60 && state.activeBombThreat; m++) {
      stepIncidentMinute(state, m, events)
    }
    expect(state.activeBombThreat).toBeNull()
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'sweep complete' })
  })

  it('sweep with no security office is the 25% gamble — both outcomes by seed', () => {
    // Seed 7's first roll is 0.0117 < 0.25 → detonation.
    const boom = makeTestState({ seed: 7 })
    placeSlabRow(boom, 0, 0, 60)
    const hit = occupiedOffice(boom, 0, 26)
    const safeOffice = occupiedOffice(boom, 0, 40) // outside the 12-tile span
    injectThreat(boom, 0, 30)
    const boomEvents: EngineEvent[] = []
    resolveBombThreat(boom, 'sweep', boomEvents)
    expect(boomEvents).toContainEqual(expect.objectContaining({ type: 'explosion', floor: 0, damagedUnitIds: [hit.id] }))
    expect(hit.offline).toBe(true)
    expect(safeOffice.offline).toBe(false)

    // Seed 1's first roll is 0.627 ≥ 0.25 → nothing found.
    const safe = makeTestState({ seed: 1 })
    placeSlabRow(safe, 0, 0, 60)
    occupiedOffice(safe, 0, 26)
    injectThreat(safe, 0, 30)
    const safeEvents: EngineEvent[] = []
    resolveBombThreat(safe, 'sweep', safeEvents)
    expect(safeEvents).toContainEqual({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'nothing found' })
    expect(safe.units.every((u) => !u.offline)).toBe(true)
  })

  it('an ignored threat auto-resolves down the risk path after 60 minutes', () => {
    const state = makeTestState({ seed: 1 }) // safe outcome
    placeSlabRow(state, 0, 0, 40)
    occupiedOffice(state, 0, 26)
    injectThreat(state, 0, 30)
    const events: EngineEvent[] = []
    stepIncidentMinute(state, 100, events) // starts the (self-healing) deadline clock
    stepIncidentMinute(state, 159, events)
    expect(state.activeBombThreat).not.toBeNull()
    stepIncidentMinute(state, 160, events)
    expect(state.activeBombThreat).toBeNull()
    expect(events.some((e) => e.type === 'incidentResolved')).toBe(true)
  })

  it('offline units earn no rent until repaired', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const office = occupiedOffice(state, 0, 10)
    office.offline = true
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['rent.office']).toBeUndefined()

    const fundsBefore = state.funds
    repairUnit(state, office.id, [])
    expect(office.offline).toBe(false)
    expect(state.funds).toBe(fundsBefore - TUNING.incidents.repairCostPerTile * 6)
    expect(state.ledgerToday.lines.repairs).toBe(-TUNING.incidents.repairCostPerTile * 6)
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['rent.office']).toBe(400)
  })

  it('keeps the incident eval penalty for three game-days after repair', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const office = occupiedOffice(state, 0, 10)
    office.offline = true

    const damagedEval = evalUnit(state, office)

    repairUnit(state, office.id, [])

    expect(office.incidentPenaltyUntilDay).toBe(state.clock.day + TUNING.evalWeights.incidentPenaltyDays)
    expect(evalUnit(state, office)).toBe(damagedEval)

    state.clock.day += 1
    expect(evalUnit(state, office)).toBe(damagedEval)
    state.clock.day += 1
    expect(evalUnit(state, office)).toBe(damagedEval)
    state.clock.day += 1
    expect(evalUnit(state, office)).toBe(damagedEval + TUNING.evalWeights.incidentPenalty)
  })
})

describe('fire incident', () => {
  it('uses the risk sum for ignition and the same weights for an id-ordered pick', () => {
    const state = makeTestState()
    setStars(state, TUNING.incidents.fire.starGate)
    placeSlabRow(state, 0, 0, 80)
    occupiedOffice(state, 0, 0) // weight 1
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 6, width: 12, storeys: 1, evalScore: 60 }) // weight 4
    const damaged = injectUnit(state, { kind: 'officeS', floor: 0, x: 18, width: 6, storeys: 1, offline: true }) // weight 2
    injectUnit(state, { kind: 'securityOffice', floor: 0, x: 40, width: 10, storeys: 1 })

    expect(fireIgnitionP(state)).toBeCloseTo(TUNING.incidents.fire.baseDailyP * 7)
    state.rng = sequenceRng(0, 0.8) // ignition succeeds; 5.6/7 selects the damaged unit
    const events: EngineEvent[] = []
    stepIncidents(state, true, events)

    expect(state.activeFire?.burningUnitIds).toEqual([damaged.id])
    expect(events).toContainEqual({ type: 'incidentStarted', kind: 'fire', floor: 0 })
  })

  it('spreads one touching ring per interval and resolves at the security ETA', () => {
    const state = makeTestState()
    const first = injectUnit(state, { kind: 'officeS', floor: 4, x: 0, width: 6, storeys: 1, occupied: true })
    const second = injectUnit(state, { kind: 'officeS', floor: 4, x: 6, width: 6, storeys: 1, occupied: true })
    const third = injectUnit(state, { kind: 'officeS', floor: 4, x: 12, width: 6, storeys: 1, occupied: true })
    state.activeFire = {
      kind: 'fire',
      floor: 4,
      burningUnitIds: [first.id],
      spreadRemainingMin: TUNING.incidents.fire.spreadIntervalGameMin,
      responseRemainingMin: TUNING.incidents.fire.spreadIntervalGameMin * 2 + 1,
    }

    for (let minute = 0; minute < TUNING.incidents.fire.spreadIntervalGameMin - 1; minute += 1) {
      stepIncidentMinute(state, minute, [])
    }
    expect(state.activeFire?.burningUnitIds).toEqual([first.id])
    stepIncidentMinute(state, 15, [])
    expect(state.activeFire?.burningUnitIds).toEqual([first.id, second.id])
    for (let minute = 16; minute < 30; minute += 1) {
      stepIncidentMinute(state, minute, [])
    }
    stepIncidentMinute(state, 30, [])
    expect(state.activeFire?.burningUnitIds).toEqual([first.id, second.id, third.id])

    const events: EngineEvent[] = []
    stepIncidentMinute(state, 31, events)
    expect(state.activeFire).toBeNull()
    expect([first, second, third].every((unit) => unit.offline && unit.damageKind === 'fire' && !unit.occupied)).toBe(true)
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'fire', outcome: 'security response extinguished fire' })
  })

  it('uses bomb-sweep coverage timing for the nearest security office', () => {
    const state = makeTestState()
    setStars(state, TUNING.incidents.fire.starGate)
    occupiedOffice(state, 5, 30)
    injectUnit(state, { kind: 'securityOffice', floor: 0, x: 0, width: 10, storeys: 1 })
    state.rng = sequenceRng(0, 0)

    stepIncidents(state, true, [])

    const coverage = 5 + (33 - 9) / 10 // office center x=33 to security edge x=9
    expect(state.activeFire?.responseRemainingMin).toBeCloseTo(
      TUNING.incidents.sweepBaseMin + TUNING.incidents.sweepPerCoverageMin * coverage,
    )
  })

  it('burns only the ignition slab segment when no security office exists', () => {
    const state = makeTestState()
    setStars(state, TUNING.incidents.fire.starGate)
    placeSlabRow(state, 0, 0, 20)
    placeSlabRow(state, 0, 40, 60)
    const ignition = occupiedOffice(state, 0, 0)
    const sameSegment = occupiedOffice(state, 0, 8)
    const otherSegment = occupiedOffice(state, 0, 40)
    state.rng = sequenceRng(0, 0)
    const events: EngineEvent[] = []

    stepIncidents(state, true, events)

    expect(state.activeFire).toBeNull()
    expect(ignition.damageKind).toBe('fire')
    expect(sameSegment.damageKind).toBe('fire')
    expect(otherSegment.damageKind).toBeNull()
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'fire', outcome: 'unprotected segment burned out' })
  })

  it('repairs fire damage at the fire rate and starts the shared three-day eval window', () => {
    const state = makeTestState()
    const unit = occupiedOffice(state, 0, 0)
    unit.offline = true
    unit.damageKind = 'fire'
    const fundsBefore = state.funds

    repairUnit(state, unit.id, [])

    expect(state.funds).toBe(fundsBefore - TUNING.incidents.fire.repairPerTile * unit.width)
    expect(unit.damageKind).toBeNull()
    expect(unit.incidentPenaltyUntilDay).toBe(state.clock.day + TUNING.evalWeights.incidentPenaltyDays)
  })
})

describe('fire response (respondToFire)', () => {
  function injectActiveFire(state: EngineState, floor: number, burningIds: number[]): void {
    state.activeFire = {
      kind: 'fire',
      floor,
      burningUnitIds: burningIds,
      spreadRemainingMin: TUNING.incidents.fire.spreadIntervalGameMin,
      responseRemainingMin: 999,
    }
  }

  const fireOf = (burningUnitIds: number[]): Parameters<typeof fireDispatchCost>[0] => ({
    kind: 'fire',
    floor: 0,
    burningUnitIds,
    spreadRemainingMin: 0,
    responseRemainingMin: 0,
  })

  it('fireDispatchCost is the flat call-out plus a per-burning-unit charge', () => {
    expect(fireDispatchCost(fireOf([]))).toBe(TUNING.incidents.fire.dispatchBase)
    expect(fireDispatchCost(fireOf([1, 2, 3]))).toBe(
      TUNING.incidents.fire.dispatchBase + TUNING.incidents.fire.dispatchPerUnit * 3,
    )
  })

  it('paid dispatch charges base + per-unit, extinguishes, damages the burning units, and draws no rng', () => {
    const state = makeTestState()
    const a = injectUnit(state, { kind: 'officeS', floor: 4, x: 0, width: 6, storeys: 1, occupied: true })
    const b = injectUnit(state, { kind: 'officeS', floor: 4, x: 6, width: 6, storeys: 1, occupied: true })
    injectActiveFire(state, 4, [a.id, b.id])
    state.funds = 1_000_000
    state.rng = sequenceRng(0.5, 0.5)
    const events: EngineEvent[] = []

    respondToFire(state, 'dispatch', events)

    const cost = TUNING.incidents.fire.dispatchBase + TUNING.incidents.fire.dispatchPerUnit * 2
    expect(state.funds).toBe(1_000_000 - cost)
    expect(state.activeFire).toBeNull()
    expect([a, b].every((u) => u.offline && u.damageKind === 'fire' && !u.occupied)).toBe(true)
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'fire', outcome: 'fire brigade dispatched' })
    expect(state.rng.state()).toBe(0) // zero rng
  })

  it('dispatch with insufficient funds arms a loan prompt and leaves the fire active', () => {
    const state = makeTestState()
    const a = injectUnit(state, { kind: 'officeS', floor: 4, x: 0, width: 6, storeys: 1, occupied: true })
    injectActiveFire(state, 4, [a.id])
    const cost = TUNING.incidents.fire.dispatchBase + TUNING.incidents.fire.dispatchPerUnit
    state.funds = cost - 1
    const events: EngineEvent[] = []

    respondToFire(state, 'dispatch', events)

    expect(state.activeFire).not.toBeNull()
    expect(a.offline).toBe(false)
    expect(state.funds).toBe(cost - 1) // not spent
    expect(state.pendingLoanPrompt).not.toBeNull()
    expect(events.some((event) => event.type === 'loanPrompt')).toBe(true)
  })

  it('firebreak is free, sacrifices only the units the fire would spread into, and extinguishes', () => {
    const state = makeTestState()
    const burning = injectUnit(state, { kind: 'officeS', floor: 4, x: 6, width: 6, storeys: 1, occupied: true })
    const leftNeighbor = injectUnit(state, { kind: 'officeS', floor: 4, x: 0, width: 6, storeys: 1, occupied: true })
    const rightNeighbor = injectUnit(state, { kind: 'officeS', floor: 4, x: 12, width: 6, storeys: 1, occupied: true })
    const farUnit = injectUnit(state, { kind: 'officeS', floor: 4, x: 20, width: 6, storeys: 1, occupied: true })
    injectActiveFire(state, 4, [burning.id])
    state.funds = 500_000
    state.rng = sequenceRng(0.5)
    const events: EngineEvent[] = []

    respondToFire(state, 'firebreak', events)

    expect(state.funds).toBe(500_000) // free
    expect(state.activeFire).toBeNull()
    expect(burning.offline && burning.damageKind === 'fire').toBe(true)
    expect(leftNeighbor.offline && leftNeighbor.damageKind === 'fire').toBe(true)
    expect(rightNeighbor.offline && rightNeighbor.damageKind === 'fire').toBe(true)
    expect(farUnit.offline).toBe(false) // beyond the firebreak
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'fire', outcome: 'firebreak cut' })
    expect(state.rng.state()).toBe(0) // zero rng
  })

  it('wait is a no-op: no events, no state change, no rng draw (byte-identical to no command)', () => {
    const state = makeTestState()
    const burning = injectUnit(state, { kind: 'officeS', floor: 4, x: 0, width: 6, storeys: 1, occupied: true })
    injectActiveFire(state, 4, [burning.id])
    state.funds = 500_000
    state.rng = sequenceRng(0.1, 0.2)
    const events: EngineEvent[] = []

    respondToFire(state, 'wait', events)

    expect(events).toEqual([])
    expect(state.funds).toBe(500_000)
    expect(state.activeFire?.burningUnitIds).toEqual([burning.id])
    expect(burning.offline).toBe(false)
    expect(state.rng.state()).toBe(0)
  })

  it('is a no-op when no fire is active', () => {
    const state = makeTestState()
    const events: EngineEvent[] = []

    respondToFire(state, 'dispatch', events)
    respondToFire(state, 'firebreak', events)

    expect(events).toEqual([])
    expect(state.activeFire).toBeNull()
  })
})

describe('ransom funding (review fix #2)', () => {
  it('a broke player gets the loan prompt and the threat stays active', () => {
    const state = makeTestState({ funds: 1000 })
    setStars(state, 3, 3)
    injectThreat(state, 2, 30) // ransom 150k
    const events: EngineEvent[] = []
    resolveBombThreat(state, 'ransom', events)

    expect(state.activeBombThreat).not.toBeNull() // still live — deadline keeps ticking
    expect(state.funds).toBe(1000)
    expect(state.ledgerToday.lines['incident.cost']).toBeUndefined()
    expect(events).toContainEqual(expect.objectContaining({ type: 'loanPrompt' }))
    expect(state.pendingLoanPrompt?.shortfall).toBe(149_000)

    // Accept the loan → the retry succeeds.
    acceptLoan(state, 200_000, events)
    resolveBombThreat(state, 'ransom', events)
    expect(state.activeBombThreat).toBeNull()
    expect(state.funds).toBe(1000 + 200_000 - 150_000)
    expect(state.ledgerToday.lines['incident.cost']).toBe(-150_000)
  })
})

describe('cockroaches', () => {
  it('spawns only in low-eval food units', () => {
    const state = makeTestState({ seed: 7 }) // first roll 0.0117 < 0.05
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 60)
    const grimy = injectUnit(state, { kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true, evalScore: 30 })
    const clean = injectUnit(state, { kind: 'fastfood', floor: 0, x: 20, width: 12, storeys: 1, occupied: true, evalScore: 60 })
    const office = occupiedOffice(state, 0, 40) // not food — never rolls
    state.rng = sequenceRng(0.99, 0.01) // no fire, then infestation spawn
    const events: EngineEvent[] = []
    stepIncidents(state, true, events)
    expect(grimy.infested).toBe(true)
    expect(clean.infested).toBe(false)
    expect(office.infested).toBe(false)
    expect(events).toContainEqual({ type: 'incidentStarted', kind: 'cockroach', floor: 0 })
  })

  it('spreads to adjacent units (same floor ≤6 tiles, or directly above/below)', () => {
    const state = makeTestState({ seed: 7 }) // first roll < 0.15 → the first spread candidate catches it
    placeSlabRow(state, 0, 0, 60)
    placeSlabRow(state, 1, 0, 60)
    const source = injectUnit(state, { kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true, evalScore: 60, infested: true })
    const above = injectUnit(state, { kind: 'officeS', floor: 1, x: 4, width: 6, storeys: 1, occupied: true, evalScore: 60 })
    const far = injectUnit(state, { kind: 'officeS', floor: 0, x: 30, width: 6, storeys: 1, occupied: true, evalScore: 60 })
    void source
    stepIncidents(state, true, [])
    expect(above.infested).toBe(true) // directly above with x overlap, first candidate in id order
    expect(far.infested).toBe(false) // 18 tiles away — not adjacent
  })

  it('penalizes neighbors and pest control clears it', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    const roachNest = injectUnit(state, { kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true, infested: true })
    const neighbor = injectUnit(state, { kind: 'officeS', floor: 0, x: 14, width: 6, storeys: 1, occupied: true })
    injectUnit(state, { kind: 'restroom', floor: 0, x: 30, width: 4, storeys: 1 })
    const infestedEval = evalUnit(state, neighbor)

    const fundsBefore = state.funds
    const events: EngineEvent[] = []
    pestControl(state, roachNest.id, events)
    expect(roachNest.infested).toBe(false)
    expect(state.funds).toBe(fundsBefore - TUNING.incidents.pestControlCost)
    expect(state.ledgerToday.lines['incident.cost']).toBe(-TUNING.incidents.pestControlCost)
    // Clearing the nest removes exactly the neighbor penalty (noise etc. unchanged).
    expect(evalUnit(state, neighbor) - infestedEval).toBe(TUNING.incidents.roachNeighborEvalPenalty)
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'cockroach', outcome: 'pest control' })
  })
})

describe('disaster option', () => {
  it('starts no disasters or rng draws before security offices are eligible', () => {
    const state = makeTestState({ seed: 7 })
    setStars(state, 3, 3)
    injectUnit(state, {
      kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true, evalScore: 0,
    })
    occupiedOffice(state, 0, 30).population.low = 100_000
    const rngBefore = state.rng.state()
    const events: EngineEvent[] = []

    stepIncidents(state, false, events)

    expect(state.rng.state()).toBe(rngBefore)
    expect(events.filter((event) => event.type === 'incidentStarted')).toEqual([])
  })

  it('consumes no rng and starts no disasters when disabled over a long daily soak', () => {
    const state = makeTestState({ seed: 7 })
    state.options.disastersEnabled = false
    placeSlabRow(state, 0, 0, 60)
    const food = injectUnit(state, {
      kind: 'fastfood', floor: 0, x: 0, width: 12, storeys: 1, occupied: true, evalScore: 0,
    })
    occupiedOffice(state, 0, 30).population.low = 100_000
    const rngBefore = state.rng.state()
    const events: EngineEvent[] = []

    for (let day = 0; day < 100; day += 1) {
      stepIncidents(state, false, events)
      state.clock.day += 1
    }

    expect(state.rng.state()).toBe(rngBefore)
    expect(state.activeBombThreat).toBeNull()
    expect(food.infested).toBe(false)
    expect(events.filter((event) => event.type === 'incidentStarted')).toEqual([])
  })

  it('continues resolving an active incident after disasters are disabled', () => {
    const state = makeTestState()
    state.options.disastersEnabled = false
    const threat = injectThreat(state, 0, 10)
    injectUnit(state, { kind: 'securityOffice', floor: 0, x: 10, width: 10, storeys: 1 })

    resolveBombThreat(state, 'sweep', [])
    expect(threat.sweepRemainingMin).not.toBeNull()
    const events: EngineEvent[] = []
    for (let minute = 0; minute < 40; minute += 1) {
      stepIncidentMinute(state, minute, events)
    }

    expect(state.activeBombThreat).toBeNull()
    expect(events).toContainEqual({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'sweep complete' })
  })
})

describe('tenant requests', () => {
  it('generates from the first deficit in priority order (hungry offices win)', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    occupiedOffice(state, 0, 10) // no food anywhere near
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 30, width: 4, storeys: 1,
      occupied: true, population: { low: 700, med: 0, high: 0, vip: 0 },
    }) // pop ≥ 600 with no express — the LOWER-priority deficit
    const events: EngineEvent[] = []
    generateRequest(state, events)
    expect(state.activeRequest).toMatchObject({ wantsKind: 'fastfood', nearFloor: 0 })
    expect(events).toContainEqual(expect.objectContaining({ type: 'tenantRequest' }))
  })

  it('falls through to the express deficit when offices are fed', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    occupiedOffice(state, 0, 10)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 18, width: 12, storeys: 1, occupied: true })
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 40, width: 4, storeys: 1,
      occupied: true, population: { low: 700, med: 0, high: 0, vip: 0 },
    })
    generateRequest(state, [])
    expect(state.activeRequest).toMatchObject({ wantsKind: 'express' })
  })

  it('requests a restroom for a fed but restroom-less occupied office', () => {
    // Now that a missing restroom is a soft eval drag (not a hard lease block),
    // offices can lease without one — so this once-dormant deficit fires.
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    const office = occupiedOffice(state, 0, 10)
    office.flags.noRestroom = true
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 18, width: 12, storeys: 1, occupied: true }) // fed → not hungry
    generateRequest(state, [])
    expect(state.activeRequest).toMatchObject({ wantsKind: 'restroom', nearFloor: 0 })
  })

  it('fulfillment pays the reward and applies the timed tower-wide bonus', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    occupiedOffice(state, 0, 10)
    generateRequest(state, [])
    expect(state.activeRequest?.wantsKind).toBe('fastfood')
    stepIncidentMinute(state, 500, []) // baseline snapshot

    const office = state.units.find((u) => u.kind === 'officeS')!
    const evalBefore = evalUnit(state, office)
    injectUnit(state, { kind: 'fastfood', floor: 0, x: 30, width: 12, storeys: 1, occupied: true })
    const fundsBefore = state.funds
    const events: EngineEvent[] = []
    stepIncidentMinute(state, 501, events)

    expect(events).toContainEqual(expect.objectContaining({ type: 'requestFulfilled', reward: TUNING.incidents.requestReward }))
    expect(state.funds).toBe(fundsBefore + TUNING.incidents.requestReward)
    expect(state.ledgerToday.lines['incident.cost']).toBe(TUNING.incidents.requestReward) // positive reward line
    expect(state.activeRequest).toBeNull()
    expect(requestEvalBonus(state)).toBe(TUNING.incidents.requestEvalBonus)
    expect(evalUnit(state, office)).toBeGreaterThanOrEqual(evalBefore) // +3 minus any new noise from the fastfood

    state.clock.day += TUNING.incidents.requestEvalBonusDays
    expect(requestEvalBonus(state)).toBe(0) // glow expires
  })

  it('expires after the window and frees the slot', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    occupiedOffice(state, 0, 10)
    generateRequest(state, [])
    const requestId = state.activeRequest!.id
    state.clock.day += TUNING.incidents.requestWindowDays
    const events: EngineEvent[] = []
    stepIncidents(state, true, events)
    expect(events).toContainEqual({ type: 'requestExpired', requestId })
    expect(state.activeRequest).toBeNull()
  })
})

describe('determinism with incidents live', () => {
  it('a 2-day engine run is byte-identical per seed', () => {
    const run = (seed: number): string => {
      const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 })
      const log: unknown[] = []
      log.push(...stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0))
      log.push(
        ...stepEngine(
          state,
          [
            { type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 },
            { type: 'place', kind: 'slab', floor: 1, x: 100, widthTiles: 40 },
            { type: 'placeShaft', kind: 'standard', x: 130, bottomFloor: 0, topFloor: 1 },
            { type: 'place', kind: 'officeS', floor: 1, x: 100 },
            { type: 'place', kind: 'restroom', floor: 1, x: 110 },
            { type: 'place', kind: 'fastfood', floor: 1, x: 116 },
          ],
          0,
        ),
      )
      for (let i = 0; i < 5400; i++) {
        log.push(...stepEngine(state, [], 1 / 15))
      }
      return JSON.stringify(log)
    }
    const first = run(42)
    expect(first).not.toContain('placementRejected')
    expect(run(42)).toBe(first)
    expect(run(43)).not.toBe(first)
  })
})
