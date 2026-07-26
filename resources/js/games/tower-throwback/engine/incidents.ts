/**
 * Incidents & tenant requests — bomb threats, cockroach infestations, and the
 * Monday request pipeline.
 *
 * Daily 09:00 check (`stepIncidents`, weekday bombs only), fixed rng order:
 * bomb roll → fire roll/pick → roach spawn rolls (food units, id order) → roach spread rolls
 * (infested id order × candidate id order) → request expiry. Requests generate
 * Mondays 08:00 (`generateRequest`, rng-free deficit scan). Sweep timers, the
 * 60-minute unanswered-threat deadline, and request-fulfillment detection ride
 * the schedules minute hook (`stepIncidentMinute`).
 *
 * Bomb resolution: 'ransom' pays `ransomPerStar × star` ('incident.cost');
 * 'sweep' with a security office runs `sweepBaseMin + sweepPerCoverageMin ×
 * (|Δfloors| + Δtiles/10)` and always ends safely; with NO office 'sweep' is
 * the spec's "risk it" path — an immediate roll, noSecurityExplosionP →
 * explosion. Ignoring the threat for 60 game-minutes auto-resolves down the
 * risk path. An explosion knocks every non-structure unit overlapping the
 * 12-tile span offline (rent/visits already skip offline units — verified in
 * economy.settleRent, people.postVisitIncome/passBySales, occupancy.tryLease,
 * schedules.operatingCommerce).
 *
 * Ledger note: the tenant-request reward posts as a POSITIVE 'incident.cost'
 * entry — no LedgerLine contract addition; the signed convention keeps the
 * whole incident story on one line (conductor-approved).
 *
 * Auxiliary threat deadlines, request baselines, and tower-wide eval-bonus
 * expiry live in a WeakMap and are included in deterministic save snapshots.
 */

import type { EngineEvent, EngineState, FireState, ItemKind, TenantRequest, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef } from './catalog'
import { accrue, postImmediate, requestSpend } from './economy'
import { getSegments, isSlabFamily } from './grid'
import { vacateUnit } from './occupancy'
import { parkingShortfall } from './parking'
import { randomInt } from './rng'
import { populationOf } from './stars'

const THREAT_DEADLINE_MIN = 60
export const REQUEST_GENERATION_MINUTE = 8 * 60
export const INCIDENT_CHECK_MINUTE = 9 * 60
const REQUEST_FOOD_RANGE_TILES = 12
const REQUEST_FOOD_RANGE_FLOORS = 2
const REQUEST_NEAR_FLOORS = 5
const REQUEST_EXPRESS_POP = 600

const FOOD_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['fastfood', 'foodCourt', 'restaurant', 'fancyRestaurant'])

interface IncidentAux {
  threatDeadlineAbs: number | null
  /** Matching unit/shaft ids that existed when the request was generated. */
  requestBaseline: Set<number> | null
  evalBonusUntilDay: number | null
}

export interface IncidentRuntimeSnapshot {
  threatDeadlineAbs: number | null
  requestBaseline: number[] | null
  evalBonusUntilDay: number | null
}

const auxMap = new WeakMap<EngineState, IncidentAux>()

function getAux(state: EngineState): IncidentAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { threatDeadlineAbs: null, requestBaseline: null, evalBonusUntilDay: null }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotIncidentRuntime(state: EngineState): IncidentRuntimeSnapshot {
  const aux = getAux(state)
  return {
    threatDeadlineAbs: aux.threatDeadlineAbs,
    requestBaseline: aux.requestBaseline ? [...aux.requestBaseline] : null,
    evalBonusUntilDay: aux.evalBonusUntilDay,
  }
}

export function restoreIncidentRuntime(state: EngineState, snapshot: IncidentRuntimeSnapshot): void {
  auxMap.set(state, {
    threatDeadlineAbs: snapshot.threatDeadlineAbs,
    requestBaseline: snapshot.requestBaseline ? new Set(snapshot.requestBaseline) : null,
    evalBonusUntilDay: snapshot.evalBonusUntilDay,
  })
}

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

function tileGap(aX: number, aWidth: number, bX: number, bWidth: number): number {
  const aHi = aX + aWidth - 1
  const bHi = bX + bWidth - 1
  if (bX > aHi) {
    return bX - aHi
  }
  if (aX > bHi) {
    return aX - bHi
  }
  return 0
}

// ── Bomb threats ─────────────────────────────────────────────────────────────

/** Daily threat probability (exported for the math test). */
export function bombThreatP(state: EngineState): number {
  return Math.min(
    TUNING.incidents.bombPPerStar * state.star + populationOf(state) / TUNING.incidents.bombPopDivisor,
    TUNING.incidents.bombPCap,
  )
}

function rollBombThreat(state: EngineState, events: EngineEvent[]): void {
  if (state.activeBombThreat !== null) {
    return
  }
  if (state.rng.next() >= bombThreatP(state)) {
    return
  }
  const occupied = unitsInIdOrder(state).filter((u) => u.occupied && !isSlabFamily(u.kind))
  if (occupied.length === 0) {
    return
  }
  const floors = [...new Set(occupied.map((u) => u.floor))].sort((a, b) => a - b)
  const floor = floors[randomInt(state.rng, floors.length)]!
  const onFloor = occupied.filter((u) => u.floor === floor)
  const unit = onFloor[randomInt(state.rng, onFloor.length)]!
  state.activeBombThreat = {
    kind: 'bombThreat',
    floor,
    x: unit.x + Math.floor(unit.width / 2),
    sweepRemainingMin: null,
    ransom: TUNING.incidents.ransomPerStar * state.star,
  }
  getAux(state).threatDeadlineAbs = state.clock.day * 1440 + state.clock.minute + THREAT_DEADLINE_MIN
  events.push({ type: 'incidentStarted', kind: 'bombThreat', floor })
}

function securityCoverage(state: EngineState, floor: number, x: number): number | null {
  let best: number | null = null
  for (const office of unitsInIdOrder(state)) {
    if (office.kind !== 'securityOffice' || office.offline) {
      continue
    }
    const distance = Math.abs(office.floor - floor) + tileGap(x, 1, office.x, office.width) / 10
    if (best === null || distance < best) {
      best = distance
    }
  }
  return best
}

function explode(state: EngineState, events: EngineEvent[]): void {
  const threat = state.activeBombThreat
  if (!threat) {
    return
  }
  const span = TUNING.incidents.explosionSpanTiles
  const lo = threat.x - Math.floor(span / 2)
  const hi = lo + span - 1
  const damagedUnitIds: number[] = []
  for (const unit of unitsInIdOrder(state)) {
    if (unit.floor !== threat.floor || isSlabFamily(unit.kind)) {
      continue
    }
    if (unit.x + unit.width - 1 >= lo && unit.x <= hi) {
      unit.offline = true
      unit.damageKind = 'explosion'
      unit.incidentPenaltyUntilDay = null
      damagedUnitIds.push(unit.id)
    }
  }
  events.push({ type: 'explosion', floor: threat.floor, damagedUnitIds })
  events.push({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'explosion' })
  state.activeBombThreat = null
  getAux(state).threatDeadlineAbs = null
}

// ── Fires ────────────────────────────────────────────────────────────────────

function fireRiskWeight(unit: Unit): number {
  if (isSlabFamily(unit.kind)) {
    return 0
  }
  if (FOOD_KINDS.has(unit.kind)) {
    return TUNING.incidents.fire.kitchenWeight
  }
  if (unit.offline) {
    return TUNING.incidents.fire.damagedWeight
  }
  return unit.occupied ? 1 : 0
}

function disastersEligible(state: EngineState): boolean {
  return state.maxStarReached >= itemDef('securityOffice').starRequired
}

export function fireIgnitionP(state: EngineState): number {
  if (state.maxStarReached < TUNING.incidents.fire.starGate || state.activeFire !== null) {
    return 0
  }
  return Math.min(1, TUNING.incidents.fire.baseDailyP * fireRiskTotal(state))
}

function fireRiskTotal(state: EngineState): number {
  return unitsInIdOrder(state).reduce((sum, unit) => sum + fireRiskWeight(unit), 0)
}

function fireTarget(state: EngineState, totalWeight: number): Unit | null {
  let cursor = state.rng.next() * totalWeight
  for (const unit of unitsInIdOrder(state)) {
    const weight = fireRiskWeight(unit)
    if (weight <= 0) {
      continue
    }
    if (cursor < weight) {
      return unit
    }
    cursor -= weight
  }
  return null
}

function applyFireDamage(state: EngineState, unitIds: readonly number[], events: EngineEvent[]): void {
  const damaged = new Set(unitIds)
  for (const unit of unitsInIdOrder(state)) {
    if (!damaged.has(unit.id)) {
      continue
    }
    unit.offline = true
    unit.damageKind = 'fire'
    unit.incidentPenaltyUntilDay = null
    if (unit.occupied) {
      vacateUnit(unit, 'incidentDamage', events)
    }
  }
}

function resolveFire(state: EngineState, events: EngineEvent[], outcome: string): void {
  const fire = state.activeFire
  if (!fire) {
    return
  }
  applyFireDamage(state, fire.burningUnitIds, events)
  events.push({ type: 'incidentResolved', kind: 'fire', outcome })
  state.activeFire = null
}

function burnUnprotectedSegment(state: EngineState, target: Unit, events: EngineEvent[]): void {
  const center = target.x + Math.floor(target.width / 2)
  const segment = getSegments(state).get(target.floor)?.find((candidate) => center >= candidate.x0 && center <= candidate.x1)
  if (segment) {
    state.activeFire!.burningUnitIds = unitsInIdOrder(state)
      .filter(
        (unit) =>
          unit.floor === target.floor &&
          !isSlabFamily(unit.kind) &&
          unit.x <= segment.x1 &&
          unit.x + unit.width - 1 >= segment.x0,
      )
      .map((unit) => unit.id)
  }
  resolveFire(state, events, 'unprotected segment burned out')
}

function rollFire(state: EngineState, events: EngineEvent[]): void {
  const probability = fireIgnitionP(state)
  if (probability <= 0 || state.rng.next() >= probability) {
    return
  }
  const totalWeight = fireRiskTotal(state)
  const target = fireTarget(state, totalWeight)
  if (!target) {
    return
  }
  const coverage = securityCoverage(state, target.floor, target.x + Math.floor(target.width / 2))
  state.activeFire = {
    kind: 'fire',
    floor: target.floor,
    burningUnitIds: [target.id],
    spreadRemainingMin: TUNING.incidents.fire.spreadIntervalGameMin,
    responseRemainingMin:
      coverage === null ? 0 : TUNING.incidents.sweepBaseMin + TUNING.incidents.sweepPerCoverageMin * coverage,
  }
  events.push({ type: 'incidentStarted', kind: 'fire', floor: target.floor })
  if (coverage === null) {
    burnUnprotectedSegment(state, target, events)
  }
}

/**
 * Units on the fire floor immediately touching the burning span's left/right edges —
 * i.e. the ones the fire would spread into next. Shared by spread and the firebreak
 * response. Deterministic (id order) and rng-free.
 */
function adjacentFireUnitIds(state: EngineState, fire: FireState): number[] {
  const burning = new Set(fire.burningUnitIds)
  const burningEdges = new Set<number>()
  for (const source of unitsInIdOrder(state)) {
    if (burning.has(source.id) && source.floor === fire.floor) {
      burningEdges.add(source.x - 1)
      burningEdges.add(source.x + source.width)
    }
  }
  const additions: number[] = []
  for (const candidate of unitsInIdOrder(state)) {
    if (candidate.floor !== fire.floor || isSlabFamily(candidate.kind) || burning.has(candidate.id)) {
      continue
    }
    if (burningEdges.has(candidate.x + candidate.width - 1) || burningEdges.has(candidate.x)) {
      additions.push(candidate.id)
    }
  }
  return additions
}

function spreadFire(state: EngineState): void {
  const fire = state.activeFire
  if (!fire) {
    return
  }
  fire.burningUnitIds.push(...adjacentFireUnitIds(state, fire))
}

/** Paid-dispatch cost: flat call-out plus a per-burning-unit charge. */
export function fireDispatchCost(fire: FireState): number {
  return TUNING.incidents.fire.dispatchBase + TUNING.incidents.fire.dispatchPerUnit * fire.burningUnitIds.length
}

/**
 * Player command seam (engine.ts dispatch) for an active fire. Three choices, all
 * rng-free:
 *   - dispatch:  pay the brigade (via the loan flow) → extinguish now, only the
 *                already-burning units are lost.
 *   - firebreak: free — sacrifice the units the fire would spread into next, then
 *                extinguish; you lose those neighbours but pay nothing.
 *   - wait:      no-op — passive security resolution continues. Issuing 'wait' is
 *                byte-identical to issuing no command at all.
 */
export function respondToFire(state: EngineState, choice: 'dispatch' | 'firebreak' | 'wait', events: EngineEvent[]): void {
  const fire = state.activeFire
  if (!fire || choice === 'wait') {
    return
  }
  if (choice === 'dispatch') {
    const cost = fireDispatchCost(fire)
    if (!requestSpend(state, cost, events)) {
      return // loan prompt armed; the fire stays active and keeps ticking
    }
    accrue(state, 'incident.cost', -cost)
    resolveFire(state, events, 'fire brigade dispatched')
    return
  }
  applyFireDamage(state, adjacentFireUnitIds(state, fire), events)
  resolveFire(state, events, 'firebreak cut')
}

/** The no-office / ignored-threat gamble: noSecurityExplosionP → boom. */
function riskResolve(state: EngineState, events: EngineEvent[]): void {
  if (state.rng.next() < TUNING.incidents.noSecurityExplosionP) {
    explode(state, events)
    return
  }
  events.push({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'nothing found' })
  state.activeBombThreat = null
  getAux(state).threatDeadlineAbs = null
}

/** Player command seam (engine.ts dispatch). */
export function resolveBombThreat(state: EngineState, choice: 'ransom' | 'sweep', events: EngineEvent[]): void {
  const threat = state.activeBombThreat
  if (!threat || threat.sweepRemainingMin !== null) {
    return
  }
  if (choice === 'ransom') {
    if (!requestSpend(state, threat.ransom, events)) {
      return // loan prompt armed; the threat stays active (and its deadline keeps ticking)
    }
    accrue(state, 'incident.cost', -threat.ransom)
    events.push({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'ransom paid' })
    state.activeBombThreat = null
    getAux(state).threatDeadlineAbs = null
    return
  }
  const coverage = securityCoverage(state, threat.floor, threat.x)
  if (coverage === null) {
    riskResolve(state, events)
    return
  }
  threat.sweepRemainingMin = TUNING.incidents.sweepBaseMin + TUNING.incidents.sweepPerCoverageMin * coverage
  getAux(state).threatDeadlineAbs = null
}

// ── Cockroaches ──────────────────────────────────────────────────────────────

function rollRoachSpawn(state: EngineState, events: EngineEvent[]): void {
  for (const unit of unitsInIdOrder(state)) {
    if (!FOOD_KINDS.has(unit.kind) || unit.infested || unit.offline) {
      continue
    }
    if (unit.evalScore >= TUNING.incidents.roachEvalThreshold) {
      continue
    }
    if (state.rng.next() < TUNING.incidents.roachSpawnP) {
      unit.infested = true
      events.push({ type: 'incidentStarted', kind: 'cockroach', floor: unit.floor })
    }
  }
}

/** Same floor within roachAdjacencyTiles, or directly above/below with x overlap. */
export function roachAdjacent(a: Unit, b: Unit): boolean {
  if (a.floor === b.floor) {
    return tileGap(a.x, a.width, b.x, b.width) <= TUNING.incidents.roachAdjacencyTiles
  }
  if (Math.abs(a.floor - b.floor) === 1) {
    return tileGap(a.x, a.width, b.x, b.width) === 0
  }
  return false
}

function rollRoachSpread(state: EngineState, events: EngineEvent[]): void {
  const sources = unitsInIdOrder(state).filter((u) => u.infested)
  const infectedToday = new Set<number>()
  for (const source of sources) {
    for (const candidate of unitsInIdOrder(state)) {
      if (candidate.infested || infectedToday.has(candidate.id) || isSlabFamily(candidate.kind)) {
        continue
      }
      if (!roachAdjacent(source, candidate)) {
        continue
      }
      if (state.rng.next() < TUNING.incidents.roachSpreadP) {
        infectedToday.add(candidate.id)
        events.push({ type: 'incidentStarted', kind: 'cockroach', floor: candidate.floor })
      }
    }
  }
  for (const id of infectedToday) {
    const unit = state.units.find((u) => u.id === id)
    if (unit) {
      unit.infested = true
    }
  }
}

/** Player command seam: $5,000/unit, clears the infestation. */
export function pestControl(state: EngineState, unitId: number, events: EngineEvent[]): void {
  const unit = state.units.find((u) => u.id === unitId)
  if (!unit || !unit.infested) {
    return
  }
  if (!requestSpend(state, TUNING.incidents.pestControlCost, events)) {
    return
  }
  accrue(state, 'incident.cost', -TUNING.incidents.pestControlCost)
  unit.infested = false
  events.push({ type: 'incidentResolved', kind: 'cockroach', outcome: 'pest control' })
}

/** Player command seam: repairCostPerTile × width, brings the unit back online. */
export function repairUnit(state: EngineState, unitId: number, events: EngineEvent[]): void {
  const unit = state.units.find((u) => u.id === unitId)
  if (!unit || !unit.offline) {
    return
  }
  const repairPerTile = unit.damageKind === 'fire' ? TUNING.incidents.fire.repairPerTile : TUNING.incidents.repairCostPerTile
  const cost = repairPerTile * unit.width
  if (!requestSpend(state, cost, events)) {
    return
  }
  accrue(state, 'repairs', -cost)
  unit.offline = false
  unit.damageKind = null
  unit.incidentPenaltyUntilDay = state.clock.day + TUNING.evalWeights.incidentPenaltyDays
}

/** Flat neighbor penalty when any infested unit is roach-adjacent (eval hook). */
export function infestedNeighborPenalty(state: EngineState, unit: Unit): number {
  for (const other of unitsInIdOrder(state)) {
    if (other.id !== unit.id && other.infested && roachAdjacent(other, unit)) {
      return TUNING.incidents.roachNeighborEvalPenalty
    }
  }
  return 0
}

// ── Tenant requests ──────────────────────────────────────────────────────────

function operatingFoodNear(state: EngineState, office: Unit): boolean {
  return state.units.some(
    (u) =>
      FOOD_KINDS.has(u.kind) &&
      u.occupied &&
      !u.offline &&
      !u.infested &&
      Math.abs(u.floor - office.floor) <= REQUEST_FOOD_RANGE_FLOORS &&
      tileGap(office.x, office.width, u.x, u.width) <= REQUEST_FOOD_RANGE_TILES,
  )
}

function findDeficit(state: EngineState): { wantsKind: TenantRequest['wantsKind']; nearFloor: number; description: string } | null {
  const offices = unitsInIdOrder(state).filter((u) => itemDef(u.kind).category === 'office' && u.occupied)
  const hungry = offices.find((office) => !operatingFoodNear(state, office))
  if (hungry) {
    return { wantsKind: 'fastfood', nearFloor: hungry.floor, description: 'The office workers want food nearby' }
  }
  if (state.units.some((u) => u.kind === 'hotelSuite') && parkingShortfall(state)) {
    return { wantsKind: 'parkingSpace', nearFloor: -1, description: 'Hotel guests want somewhere to park' }
  }
  if (populationOf(state) >= REQUEST_EXPRESS_POP && !state.shafts.some((s) => s.kind === 'express')) {
    return { wantsKind: 'express', nearFloor: 0, description: 'Tenants want an express elevator' }
  }
  const stranded = offices.find((office) => office.flags.noRestroom)
  if (stranded) {
    return { wantsKind: 'restroom', nearFloor: stranded.floor, description: 'An office floor is missing a restroom' }
  }
  return null
}

function matchingIds(state: EngineState, request: TenantRequest): Set<number> {
  const ids = new Set<number>()
  if (request.wantsKind === 'express') {
    for (const shaft of state.shafts) {
      if (
        shaft.kind === 'express' &&
        shaft.bottomFloor <= request.nearFloor + REQUEST_NEAR_FLOORS &&
        shaft.topFloor >= request.nearFloor - REQUEST_NEAR_FLOORS
      ) {
        ids.add(shaft.id)
      }
    }
    return ids
  }
  for (const unit of state.units) {
    if (unit.kind === request.wantsKind && Math.abs(unit.floor - request.nearFloor) <= REQUEST_NEAR_FLOORS) {
      ids.add(unit.id)
    }
  }
  return ids
}

/** Mondays 08:00 — at most one active request, from the first real deficit. */
export function generateRequest(state: EngineState, events: EngineEvent[]): void {
  if (state.activeRequest !== null) {
    return
  }
  const deficit = findDeficit(state)
  if (!deficit) {
    return
  }
  const request: TenantRequest = {
    id: state.nextId,
    description: deficit.description,
    wantsKind: deficit.wantsKind,
    nearFloor: deficit.nearFloor,
    expiresDay: state.clock.day + TUNING.incidents.requestWindowDays,
  }
  state.nextId += 1
  state.activeRequest = request
  getAux(state).requestBaseline = matchingIds(state, request)
  events.push({ type: 'tenantRequest', request })
}

/** Tower-wide eval bonus while a fulfilled request's glow lasts (eval hook). */
export function requestEvalBonus(state: EngineState): number {
  const aux = getAux(state)
  if (aux.evalBonusUntilDay !== null && state.clock.day < aux.evalBonusUntilDay) {
    return TUNING.incidents.requestEvalBonus
  }
  return 0
}

function checkRequestFulfillment(state: EngineState, events: EngineEvent[]): void {
  const request = state.activeRequest
  if (!request) {
    return
  }
  const aux = getAux(state)
  if (aux.requestBaseline === null) {
    aux.requestBaseline = matchingIds(state, request) // Legacy v1 migration: only future placements count.
    return
  }
  const current = matchingIds(state, request)
  for (const id of current) {
    if (!aux.requestBaseline.has(id)) {
      postImmediate(state, 'incident.cost', TUNING.incidents.requestReward, events)
      events.push({ type: 'requestFulfilled', requestId: request.id, reward: TUNING.incidents.requestReward })
      aux.evalBonusUntilDay = state.clock.day + TUNING.incidents.requestEvalBonusDays
      state.activeRequest = null
      aux.requestBaseline = null
      return
    }
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Daily 09:00 check: bombs (weekdays) → fire → roach spawn → spread → request expiry. */
export function stepIncidents(state: EngineState, weekend: boolean, events: EngineEvent[]): void {
  if (state.options.disastersEnabled && disastersEligible(state)) {
    if (!weekend) {
      rollBombThreat(state, events)
    }
    rollFire(state, events)
    rollRoachSpawn(state, events)
  }
  rollRoachSpread(state, events)
  const request = state.activeRequest
  if (request && state.clock.day >= request.expiresDay) {
    events.push({ type: 'requestExpired', requestId: request.id })
    state.activeRequest = null
    getAux(state).requestBaseline = null
  }
}

/** Minute hook (schedules): sweep timer, ignored-threat deadline, fulfillment. */
export function stepIncidentMinute(state: EngineState, minute: number, events: EngineEvent[]): void {
  const fire = state.activeFire
  if (fire) {
    fire.responseRemainingMin -= 1
    if (fire.responseRemainingMin <= 0) {
      resolveFire(state, events, 'security response extinguished fire')
    } else {
      fire.spreadRemainingMin -= 1
      if (fire.spreadRemainingMin <= 0) {
        spreadFire(state)
        fire.spreadRemainingMin = TUNING.incidents.fire.spreadIntervalGameMin
      }
    }
  }
  const threat = state.activeBombThreat
  if (threat) {
    if (threat.sweepRemainingMin !== null) {
      threat.sweepRemainingMin -= 1
      if (threat.sweepRemainingMin <= 0) {
        events.push({ type: 'incidentResolved', kind: 'bombThreat', outcome: 'sweep complete' })
        state.activeBombThreat = null
      }
    } else {
      const aux = getAux(state)
      if (aux.threatDeadlineAbs === null) {
        // Reload (or injected threat) lost the deadline — restart the 60-min clock.
        aux.threatDeadlineAbs = state.clock.day * 1440 + minute + THREAT_DEADLINE_MIN
      } else if (state.clock.day * 1440 + minute >= aux.threatDeadlineAbs) {
        riskResolve(state, events)
      }
    }
  }
  checkRequestFulfillment(state, events)
}
