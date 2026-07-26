/**
 * VIP system — the star-up gate. Population thresholds ARM a visit; only a
 * successful VIP visit grants the star (engine.ts's old auto star-up is gone).
 *
 * Lifecycle: `stepVips` (08:00 pass) arms a pending VipRecord for
 * `star + 1` when starUpArmed and no cooldown is running, scheduling arrival
 * for the NEXT day 10:00; it also retries deferred move-ins and recovers legacy
 * visiting records that predate persisted visit state. `stepVipMinute`
 * (schedules' minute tick) starts arrivals and drives the active visit.
 *
 * Visit shapes: targets 2/3 tour up to 3 representative occupied units
 * (highest eval) plus up to 3 amenities, then leave. Targets 4/5 are a suite
 * stay — a CLEAN VACANT hotelSuite is required up front (none → auto-fail),
 * overnight (the suite bills like any guest room at midnight), morning
 * amenities, checkout (suite turns dirty), leave. The VIP is one gold Person
 * per itinerary leg, parked at each stop via a long dwell and re-spawned for
 * the next leg (`despawnPerson` + `spawnPerson`); a Person that vanishes
 * mid-leg means patience expired — the VIP walked out (auto-fail).
 *
 * Scoring per the spec rubric, all through `applyVisitEvent` (exported so
 * tests can feed synthetic events): start 100, −waitPenaltyPerMin per
 * game-minute queued beyond waitGraceMin per leg, −10 per noise-exposed stop
 * (raw exposure ≥ noiseExposureThreshold), −20 dirty suite at check-in, −10
 * per distinct overflowing trash room seen near the path, +5 per distinct
 * amenity kind visited (cap +15). Unroutable required destination → auto-fail.
 *
 * Success: applyStarUp (star + milestone events fire HERE only),
 * vipSuccessBonusPerStar × new star as 'bonus.vip', then move-in to the best
 * vacant apartment for the target (2→studio, 3→1BR, 4/5→2BR). No vacancy →
 * the star still lands and the record stays 'resident' with unitId null
 * (deferred move-in, retried each 08:00). Failure: vipFailBonus consolation,
 * report of top deductions, cooldownDays before re-arming.
 *
 * Residents: weekly satisfaction (hooked at the START of weeklyStressPass so
 * stress marks are still readable): +good/−bad by unit eval vs
 * residentEvalGood, extra penalty at ≥2 marks; below moveOutBelow → move out,
 * applyStarLoss (placement keeps using maxStarReached), cooldown, and the
 * arming logic re-earns the star later. Target 'tower' is Phase 12's.
 *
 * Determinism: no rng anywhere — stop selection is (eval desc, id asc).
 */

import type { EngineEvent, EngineState, ItemKind, Unit, VipRecord, VipTarget } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef } from './catalog'
import { postImmediate } from './economy'
import { dominantNoiseSourceAt, noiseExposureAt } from './heatmaps'
import { getMap } from './maps'
import { despawnPerson, spawnPerson, streetEntrance } from './people'
import { applyStarLoss, applyStarUp, starUpArmed } from './stars'

const ARRIVAL_MINUTE = 10 * 60
const STOP_DWELL_MIN = 15
const SUITE_MORNING_MINUTE = 9 * 60
const PARK_DWELL_MIN = 24 * 60
const REPORT_TOP_LINES = 3

const AMENITY_KINDS: readonly ItemKind[] = ['fancyRestaurant', 'spa', 'pool', 'fitness', 'movieTheater']
const MOVE_IN_KIND: Record<VipTarget, ItemKind> = {
  2: 'aptStudio',
  3: 'apt1br',
  4: 'apt2br',
  5: 'apt2br',
  tower: 'aptPenthouse',
}

// ── Visit scoring (pure, test-fed) ──────────────────────────────────────────

export type VipVisitEvent =
  | { type: 'elevatorWait'; minutes: number }
  | { type: 'noiseExposure' }
  | { type: 'dirtySuite' }
  | { type: 'trashSight' }
  | { type: 'amenity'; kind: ItemKind }

export interface VisitScore {
  score: number
  report: string[]
  amenities: Set<ItemKind>
}

export function createVisitScore(): VisitScore {
  return { score: 100, report: [], amenities: new Set() }
}

/** Apply one rubric event to a running visit score. */
export function applyVisitEvent(visit: VisitScore, event: VipVisitEvent): void {
  const v = TUNING.vip
  switch (event.type) {
    case 'elevatorWait': {
      const extra = Math.ceil(event.minutes - TUNING.elevators.waitGraceMin)
      if (extra > 0) {
        visit.score -= v.waitPenaltyPerMin * extra
        visit.report.push(`Waited ${Math.ceil(event.minutes)} min for an elevator`)
      }
      return
    }
    case 'noiseExposure':
      visit.score -= v.noiseExposurePenalty
      visit.report.push('Exposed to serious noise')
      return
    case 'dirtySuite':
      visit.score -= v.dirtyRoomPenalty
      visit.report.push('The suite was dirty at check-in')
      return
    case 'trashSight':
      visit.score -= v.trashSightPenalty
      visit.report.push('Saw overflowing trash')
      return
    case 'amenity':
      if (!visit.amenities.has(event.kind) && visit.amenities.size * v.amenityBonus < v.amenityBonusCap) {
        visit.amenities.add(event.kind)
        visit.score += v.amenityBonus
      }
      return
  }
}

// ── Runtime aux (included in deterministic save snapshots) ──────────────────

interface VisitStop {
  floor: number
  x: number
  /** The unit being visited at this stop (its own noise is expected ambiance). */
  unitId: number | null
  /** Amenity kind for the bonus; 'suite' triggers the overnight; null = plain stop. */
  amenityKind: ItemKind | null
  suite: boolean
  final: boolean
}

interface ActiveVisit {
  target: VipTarget
  scorecard: VisitScore
  stops: VisitStop[]
  stopIndex: number
  personId: number | null
  atStop: boolean
  departAbs: number | null
  queuedMinutes: number
  lastLegIndex: number
  suiteId: number | null
  trashSeen: Set<number>
}

interface VipAux {
  /** target → absolute game-minute of the scheduled arrival. */
  arrivals: Map<VipTarget, number>
  visit: ActiveVisit | null
}

export interface VipRuntimeSnapshot {
  arrivals: Array<[VipTarget, number]>
  visit: {
    target: VipTarget
    scorecard: { score: number; report: string[]; amenities: ItemKind[] }
    stops: VisitStop[]
    stopIndex: number
    personId: number | null
    atStop: boolean
    departAbs: number | null
    queuedMinutes: number
    lastLegIndex: number
    suiteId: number | null
    trashSeen: number[]
  } | null
}

const auxMap = new WeakMap<EngineState, VipAux>()

function getAux(state: EngineState): VipAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { arrivals: new Map(), visit: null }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotVipRuntime(state: EngineState): VipRuntimeSnapshot {
  const aux = getAux(state)
  const visit = aux.visit
  return {
    arrivals: [...aux.arrivals.entries()],
    visit: visit
      ? {
          ...visit,
          scorecard: {
            score: visit.scorecard.score,
            report: [...visit.scorecard.report],
            amenities: [...visit.scorecard.amenities],
          },
          stops: visit.stops.map((stop) => ({ ...stop })),
          trashSeen: [...visit.trashSeen],
        }
      : null,
  }
}

export function restoreVipRuntime(state: EngineState, snapshot: VipRuntimeSnapshot): void {
  const visit = snapshot.visit
  auxMap.set(state, {
    arrivals: new Map(snapshot.arrivals),
    visit: visit
      ? {
          ...visit,
          scorecard: {
            score: visit.scorecard.score,
            report: [...visit.scorecard.report],
            amenities: new Set(visit.scorecard.amenities),
          },
          stops: visit.stops.map((stop) => ({ ...stop })),
          trashSeen: new Set(visit.trashSeen),
        }
      : null,
  })
}

function absoluteMinute(state: EngineState, minute: number): number {
  return state.clock.day * 1440 + minute
}

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

function findRecord(state: EngineState, target: VipTarget): VipRecord | undefined {
  return state.vips.find((v) => v.target === target)
}

// ── Arming + deferred move-in (08:00 pass) ───────────────────────────────────

/** 08:00 seam called by engine.ts — arms visits, retries deferred move-ins. */
export function stepVips(state: EngineState, events: EngineEvent[]): void {
  const aux = getAux(state)

  for (const record of state.vips) {
    if (record.state === 'resident' && record.unitId === null) {
      tryMoveIn(state, record, events)
    }
    if (record.state === 'visiting' && aux.visit === null && !aux.arrivals.has(record.target)) {
      record.state = 'pending' // Legacy save without visit state — re-schedule below.
    }
  }

  // TOWER VIP: the active map's standing prestige structure arms the final visit.
  const endgameItem = getMap(state.mapId).endgameItem
  if (!state.towerAchieved && state.units.some((u) => u.kind === endgameItem && !u.offline)) {
    armVisit(state, 'tower')
    return
  }

  if (!starUpArmed(state)) {
    return
  }
  armVisit(state, (state.star + 1) as VipTarget)
}

/** Shared arming tail: respects in-flight visits, cooldowns, and dedupes records. */
function armVisit(state: EngineState, target: VipTarget): void {
  const aux = getAux(state)
  let record = findRecord(state, target)
  if (record && (record.state === 'visiting' || record.state === 'resident')) {
    return
  }
  if (record && record.cooldownUntilDay !== null && state.clock.day < record.cooldownUntilDay) {
    return
  }
  if (aux.arrivals.has(target) || aux.visit !== null) {
    return
  }
  if (!record) {
    record = {
      target,
      state: 'pending',
      satisfaction: 0,
      unitId: null,
      cooldownUntilDay: null,
      lastReport: [],
    }
    state.vips.push(record)
  }
  record.state = 'pending'
  aux.arrivals.set(target, (state.clock.day + 1) * 1440 + ARRIVAL_MINUTE)
}

function tryMoveIn(state: EngineState, record: VipRecord, events: EngineEvent[]): void {
  const kind = MOVE_IN_KIND[record.target]
  const candidates = unitsInIdOrder(state).filter(
    (u) => u.kind === kind && !u.occupied && !u.offline && !u.infested && !u.flags.noRoute,
  )
  if (candidates.length === 0) {
    return
  }
  const home = candidates.reduce((best, unit) => (unit.evalScore > best.evalScore ? unit : best))
  home.occupied = true
  home.vacancyReason = null
  home.population = { low: 0, med: 0, high: 0, vip: 1 }
  record.unitId = home.id
  events.push({ type: 'vipMovedIn', target: record.target, unitId: home.id })
}

// ── Visit itinerary ──────────────────────────────────────────────────────────

function tourStops(state: EngineState): VisitStop[] {
  const stops: VisitStop[] = []
  const representative = unitsInIdOrder(state)
    .filter((u) => {
      const category = itemDef(u.kind).category
      return u.occupied && !u.flags.noRoute && (category === 'office' || category === 'residential' || category === 'commerce')
    })
    .sort((a, b) => b.evalScore - a.evalScore || a.id - b.id)
    .slice(0, 3)
  for (const unit of representative) {
    stops.push({ floor: unit.floor, x: unit.x, unitId: unit.id, amenityKind: null, suite: false, final: false })
  }
  return stops
}

function amenityStops(state: EngineState): VisitStop[] {
  const stops: VisitStop[] = []
  for (const kind of AMENITY_KINDS) {
    if (stops.length >= 3) {
      break
    }
    const venue = unitsInIdOrder(state).find((u) => u.kind === kind && u.occupied && !u.offline && !u.infested)
    if (venue) {
      stops.push({ floor: venue.floor, x: venue.x, unitId: venue.id, amenityKind: kind, suite: false, final: false })
    }
  }
  return stops
}

function cleanVacantSuite(state: EngineState): Unit | null {
  return (
    unitsInIdOrder(state).find(
      (u) => u.kind === 'hotelSuite' && !u.occupied && !u.dirty && !u.offline && !u.infested && !u.flags.noRoute && !u.flags.noReception,
    ) ?? null
  )
}

function startVisit(state: EngineState, target: VipTarget, events: EngineEvent[]): void {
  const aux = getAux(state)
  const record = findRecord(state, target)
  const entrance = streetEntrance(state)
  if (!record || !entrance) {
    return
  }

  const suiteStay = target === 4 || target === 5
  let suite: Unit | null = null
  const stops: VisitStop[] = []
  if (target === 'tower') {
    const endgameKind = getMap(state.mapId).endgameItem
    const penthouse = unitsInIdOrder(state).find(
      (u) => u.kind === 'aptPenthouse' && !u.occupied && !u.offline && !u.infested && !u.flags.noRoute,
    )
    const endgameStructure = state.units.find((u) => u.kind === endgameKind && !u.offline)
    if (!penthouse) {
      failWithoutVisit(state, record, ['No penthouse awaits the guest of honor'], events)
      return
    }
    if (!endgameStructure) {
      failWithoutVisit(state, record, [`The ${itemDef(endgameKind).name.toLowerCase()} is gone`], events)
      return
    }
    stops.push({ floor: endgameStructure.floor, x: endgameStructure.x, unitId: endgameStructure.id, amenityKind: null, suite: false, final: false })
    stops.push(...amenityStops(state))
  } else if (suiteStay) {
    suite = cleanVacantSuite(state)
    if (!suite) {
      failWithoutVisit(state, record, ['No clean suite was available'], events)
      return
    }
    stops.push({ floor: suite.floor, x: suite.x, unitId: suite.id, amenityKind: null, suite: true, final: false })
    stops.push(...amenityStops(state))
  } else {
    stops.push(...tourStops(state))
    stops.push(...amenityStops(state))
  }
  stops.push({ floor: entrance.floor, x: entrance.x, unitId: null, amenityKind: null, suite: false, final: true })

  record.state = 'visiting'
  record.satisfaction = 100
  aux.visit = {
    target,
    scorecard: createVisitScore(),
    stops,
    stopIndex: 0,
    personId: null,
    atStop: false,
    departAbs: null,
    queuedMinutes: 0,
    lastLegIndex: 0,
    suiteId: suite?.id ?? null,
    trashSeen: new Set(),
  }
  events.push({ type: 'vipArrived', target })
  departForStop(state, aux.visit, { floor: entrance.floor, x: entrance.x }, events)
}

function failWithoutVisit(state: EngineState, record: VipRecord, report: string[], events: EngineEvent[]): void {
  record.state = 'pending'
  record.lastReport = report
  record.cooldownUntilDay = state.clock.day + TUNING.vip.cooldownDays
  postImmediate(state, 'bonus.vip', TUNING.economy.vipFailBonus, events)
  events.push({ type: 'vipResult', target: record.target, success: false, score: 0, bonus: TUNING.economy.vipFailBonus, report })
}

// ── Visit progression (minute tick) ──────────────────────────────────────────

/** Minute seam called by schedules.minuteTick — starts arrivals, drives the visit. */
export function stepVipMinute(state: EngineState, minute: number, events: EngineEvent[]): void {
  const aux = getAux(state)
  const absNow = absoluteMinute(state, minute)

  for (const [target, at] of [...aux.arrivals.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (absNow >= at && aux.visit === null) {
      aux.arrivals.delete(target)
      startVisit(state, target, events)
    }
  }

  const visit = aux.visit
  if (!visit) {
    return
  }

  if (visit.personId !== null) {
    const person = state.people.find((p) => p.id === visit.personId)
    if (!person) {
      resolveVisit(state, visit, ['The VIP gave up waiting for an elevator'], true, events)
      return
    }
    if (!visit.atStop) {
      if (person.legIndex !== visit.lastLegIndex) {
        settleLegWait(visit)
        visit.lastLegIndex = person.legIndex
      }
      if (person.state === 'queued') {
        visit.queuedMinutes += 1
      }
      if (person.legIndex >= person.legs.length) {
        settleLegWait(visit)
        arriveAtStop(state, visit, minute, events)
      }
    }
  }

  if (visit.atStop && visit.departAbs !== null && absNow >= visit.departAbs) {
    departFromStop(state, visit, events)
  }
}

function settleLegWait(visit: ActiveVisit): void {
  if (visit.queuedMinutes > 0) {
    applyVisitEvent(visit.scorecard, { type: 'elevatorWait', minutes: visit.queuedMinutes })
    visit.queuedMinutes = 0
  }
}

function departForStop(state: EngineState, visit: ActiveVisit, from: { floor: number; x: number }, events: EngineEvent[]): void {
  const stop = visit.stops[visit.stopIndex]!
  if (from.floor === stop.floor && from.x === stop.x) {
    visit.personId = null
    arriveAtStop(state, visit, state.clock.minute, events)
    return
  }
  const person = spawnPerson(state, {
    tier: 'vip',
    vip: true,
    floor: from.floor,
    x: from.x,
    toFloor: stop.floor,
    toX: stop.x,
    purpose: 'vipVisit',
    ...(stop.unitId === null ? {} : { destUnitId: stop.unitId }),
    dwellMin: PARK_DWELL_MIN,
  })
  if (!person) {
    resolveVisit(state, visit, ['There was no route to a required destination'], true, events)
    return
  }
  visit.personId = person.id
  visit.atStop = false
  visit.queuedMinutes = 0
  visit.lastLegIndex = 0
}

function arriveAtStop(state: EngineState, visit: ActiveVisit, minute: number, events: EngineEvent[]): void {
  const stop = visit.stops[visit.stopIndex]!
  visit.atStop = true

  if (stop.final) {
    if (visit.personId !== null) {
      despawnPerson(state, visit.personId)
      visit.personId = null
    }
    resolveVisit(state, visit, [], false, events)
    return
  }

  // Rubric checks at the visited tile. A venue's OWN noise is expected
  // ambiance: no deduction when the zone's dominant source is the unit being
  // visited (walking into someone ELSE's racket still dings).
  if (noiseExposureAt(state, stop.floor, stop.x, stop.x) >= TUNING.vip.noiseExposureThreshold) {
    const dominant = dominantNoiseSourceAt(state, stop.floor, stop.x, stop.x)
    if (dominant === null || dominant !== stop.unitId) {
      applyVisitEvent(visit.scorecard, { type: 'noiseExposure' })
    }
  }
  for (const unit of unitsInIdOrder(state)) {
    if (!unit.flags.trashOverflow || visit.trashSeen.has(unit.id) || unit.floor !== stop.floor) {
      continue
    }
    const gap = unit.x > stop.x ? unit.x - stop.x : stop.x - (unit.x + unit.width - 1)
    if (gap <= TUNING.evalWeights.trashRadiusTiles) {
      visit.trashSeen.add(unit.id)
      applyVisitEvent(visit.scorecard, { type: 'trashSight' })
    }
  }
  if (stop.amenityKind !== null) {
    applyVisitEvent(visit.scorecard, { type: 'amenity', kind: stop.amenityKind })
  }

  if (stop.suite && visit.suiteId !== null) {
    const suite = state.units.find((u) => u.id === visit.suiteId)
    if (suite) {
      if (suite.dirty) {
        applyVisitEvent(visit.scorecard, { type: 'dirtySuite' })
      }
      suite.occupied = true
      suite.vacancyReason = null
      suite.population = { low: 0, med: 0, high: 0, vip: 1 }
    }
    // Overnight: sleep until the next morning.
    visit.departAbs = (state.clock.day + 1) * 1440 + SUITE_MORNING_MINUTE
    return
  }
  visit.departAbs = absoluteMinute(state, minute) + STOP_DWELL_MIN
}

function departFromStop(state: EngineState, visit: ActiveVisit, events: EngineEvent[]): void {
  const stop = visit.stops[visit.stopIndex]!
  if (stop.suite && visit.suiteId !== null) {
    const suite = state.units.find((u) => u.id === visit.suiteId)
    if (suite) {
      suite.occupied = false
      suite.population = { low: 0, med: 0, high: 0, vip: 0 }
      suite.dirty = true // checkout
    }
  }
  if (visit.personId !== null) {
    despawnPerson(state, visit.personId)
    visit.personId = null
  }
  visit.stopIndex += 1
  visit.atStop = false
  visit.departAbs = null
  departForStop(state, visit, { floor: stop.floor, x: stop.x }, events)
}

// ── Resolution ───────────────────────────────────────────────────────────────

function resolveVisit(
  state: EngineState,
  visit: ActiveVisit,
  extraReport: string[],
  forceFail: boolean,
  events: EngineEvent[],
): void {
  const aux = getAux(state)
  aux.visit = null
  const record = findRecord(state, visit.target)
  if (visit.personId !== null) {
    despawnPerson(state, visit.personId)
  }
  if (visit.suiteId !== null) {
    const suite = state.units.find((u) => u.id === visit.suiteId)
    if (suite && suite.population.vip > 0) {
      suite.occupied = false
      suite.population = { low: 0, med: 0, high: 0, vip: 0 }
      suite.dirty = true
    }
  }
  if (!record) {
    return
  }

  const scorecard = visit.scorecard
  scorecard.report.push(...extraReport)
  const success = !forceFail && scorecard.score >= TUNING.vip.successThreshold
  const report = scorecard.report.slice(0, REPORT_TOP_LINES)
  record.lastReport = report
  record.satisfaction = scorecard.score

  if (success) {
    if (visit.target === 'tower') {
      // TOWER: no star to grant — the crown itself is the prize, and it is
      // NEVER revoked (a later penthouse move-out costs a star like any 5★
      // resident, but towerAchieved persists).
      state.towerAchieved = true
      if (!state.milestonesEarned.includes('tower')) {
        state.milestonesEarned.push('tower')
      }
      events.push({ type: 'towerAchieved' })
      events.push({ type: 'milestone', milestone: 'tower' })
    } else {
      applyStarUp(state, events) // star + milestone events fire only through VIP success
    }
    const bonus = TUNING.economy.vipSuccessBonusPerStar * state.star
    postImmediate(state, 'bonus.vip', bonus, events)
    events.push({ type: 'vipResult', target: visit.target, success: true, score: scorecard.score, bonus, report: [] })
    record.state = 'resident'
    record.satisfaction = TUNING.vip.residentStart
    record.unitId = null
    record.cooldownUntilDay = null
    tryMoveIn(state, record, events)
  } else {
    record.state = 'pending'
    record.cooldownUntilDay = state.clock.day + TUNING.vip.cooldownDays
    postImmediate(state, 'bonus.vip', TUNING.economy.vipFailBonus, events)
    events.push({
      type: 'vipResult',
      target: visit.target,
      success: false,
      score: scorecard.score,
      bonus: TUNING.economy.vipFailBonus,
      report,
    })
  }
}

// ── Resident satisfaction (weekly, before stress marks reset) ────────────────

/** Called at the START of occupancy.weeklyStressPass, while marks are readable. */
export function vipWeeklyPass(state: EngineState, events: EngineEvent[]): void {
  const v = TUNING.vip
  for (const record of state.vips) {
    if (record.state !== 'resident' || record.unitId === null) {
      continue
    }
    const home = state.units.find((u) => u.id === record.unitId)
    if (!home) {
      record.unitId = null // home demolished — deferred re-move-in
      continue
    }
    let delta = home.evalScore >= v.residentEvalGood ? v.residentGoodWeekDelta : v.residentBadWeekDelta
    if (home.stressMarks >= 2) {
      delta += v.residentStressWeekDelta
    }
    record.satisfaction = Math.max(0, Math.min(100, record.satisfaction + delta))
    if (record.satisfaction < v.moveOutBelow) {
      const report = [
        home.evalScore < v.residentEvalGood ? 'Their home fell below expectations' : 'Life in the tower grew stressful',
      ]
      home.occupied = false
      home.population = { low: 0, med: 0, high: 0, vip: 0 }
      home.vacancyReason = 'lowEval'
      record.state = 'movedOut'
      record.unitId = null
      record.lastReport = report
      record.cooldownUntilDay = state.clock.day + v.cooldownDays
      applyStarLoss(state, report, events)
      events.push({ type: 'vipMovedOut', target: record.target, report })
    }
  }
}
