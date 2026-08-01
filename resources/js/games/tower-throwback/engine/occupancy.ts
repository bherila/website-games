/**
 * Occupancy — the daily eval/lease/vacate pass and the weekly stress pass.
 *
 * `evalUnit` implements the spec's eval formula ("Eval formula" section)
 * term-by-term via `evalBreakdown`; `occupancyPass` runs daily at 08:00 (the
 * engine gates on `advanceClock().crossedHour08`), consuming rng only for
 * tenant tier draws (units iterated in id order). `weeklyStressPass` is called
 * by `economy.settleMidnight` at the end of each 7th day. noRoute comes from
 * routing.hasRouteToLobby.
 *
 * Simplifications (each marked at the call site):
 * - Amenity range = horizontal gap ≤ 20 tiles AND |Δfloor| ≤ 6; the spec's
 *   "same segment or ≤1 elevator leg" reachability is approximated.
 * - Commerce units don't lease: they operate (`occupied`) whenever routable.
 * - Trash overflow / incident window: the flag / `offline` field is read, but
 *   the mechanics that set them land in Phases 8–9.
 */

import type {
  EngineEvent,
  EngineState,
  IncomeTier,
  ItemKind,
  Unit,
  VacancyReason,
} from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef, shaftDef } from './catalog'
import { isWeekend } from './clock'
import { getSegments, isSlabFamily, type Segment } from './grid'
import { noiseExposureAt } from './heatmaps'
import { refreshHotelRoomFlags } from './hotel'
import { infestedNeighborPenalty, requestEvalBonus } from './incidents'
import { getMap } from './maps'
import { parkingShortfall, refreshParkingFlags } from './parking'
import { pickWeighted } from './rng'
import { findRoute, hasRouteToLobby } from './routing'
import { ELEVATOR_CROWDED_WAIT_MIN } from './shaftIssues'
import { weeklyStressThreshold } from './tenantStress'
import { vipWeeklyPass } from './vip'

/** Per-source amenity bonuses; conference/eventSpace are tower-wide per receiver category. */
const AMENITY_BONUS: Partial<Record<ItemKind, number>> = {
  fitness: 4,
  pool: 4,
  spa: 4,
  medicalClinic: 3,
  securityOffice: 3,
}

const HOTEL_ROOM_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['hotel1p', 'hotel2p', 'hotelSuite'])

export interface EvalBreakdown {
  score: number
  amenityBonus: number
  landmarkBonus: number
  fallsViewBonus: number
  affinityBonus: number
  superLobbyBonus: number
  glassBonus: number
  liveWorkBonus: number
  noisePenalty: number
  congestionPenalty: number
  restroomComfortPenalty: number
  trashPenalty: number
  dirtyPenalty: number
  incidentPenalty: number
  parkingPenalty: number
  infestationPenalty: number
  requestBonus: number
}

/** Horizontal tile gap between two footprints (0 when they overlap or touch). */
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

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

function segmentOf(state: EngineState, floor: number, x: number): Segment | null {
  const runs = getSegments(state).get(floor)
  if (!runs) {
    return null
  }
  return runs.find((run) => x >= run.x0 && x <= run.x1) ?? null
}

/**
 * Reachability gate for a "nearby" amenity/neighbor: a bonus only counts if the
 * tenant can actually walk/ride there (findRoute), not just when it's within raw
 * geometric range. Skipped when either unit lacks a walkable segment (unplaced /
 * degenerate) since reachability can't be assessed. bypassCache: a read-only
 * probe that must not seed the sim's endpoint-specific path memo.
 */
function isReachable(state: EngineState, unit: Unit, other: Unit): boolean {
  if (segmentOf(state, unit.floor, unit.x) === null || segmentOf(state, other.floor, other.x) === null) {
    return true
  }
  return findRoute(state, unit.floor, unit.x, other.floor, other.x, { bypassCache: true }) !== null
}

function amenityTerm(state: EngineState, unit: Unit): number {
  const w = TUNING.evalWeights
  const category = itemDef(unit.kind).category
  let bonus = 0
  for (const other of unitsInIdOrder(state)) {
    if (other.id === unit.id) {
      continue
    }
    const perSource = AMENITY_BONUS[other.kind]
    if (perSource !== undefined) {
      const inRange =
        Math.abs(other.floor - unit.floor) <= w.amenityRadiusFloors &&
        tileGap(unit.x, unit.width, other.x, other.width) <= w.amenityRadiusTiles &&
        isReachable(state, unit, other)
      if (inRange) {
        bonus += perSource
      }
    } else if (other.kind === 'conferenceCenter' && category === 'office') {
      bonus += 5
    } else if (other.kind === 'eventSpace' && HOTEL_ROOM_KINDS.has(unit.kind)) {
      bonus += 5
    }
  }
  return Math.min(bonus, w.amenityCap)
}

/** Nearby, reachable occupiable units benefit from the active map's standing masterpiece. */
function landmarkTerm(state: EngineState, unit: Unit): number {
  const category = itemDef(unit.kind).category
  if (!['office', 'residential', 'commerce', 'hotel'].includes(category)) {
    return 0
  }
  const landmarkKind = getMap(state.mapId).endgameItem
  const landmark = unitsInIdOrder(state).find(
    (other) => other.kind === landmarkKind && !other.offline && !other.infested && !other.flags.noRoute,
  )
  if (!landmark) {
    return 0
  }
  const w = TUNING.evalWeights
  const inRange =
    Math.abs(landmark.floor - unit.floor) <= w.landmarkRadiusFloors &&
    tileGap(unit.x, unit.width, landmark.x, landmark.width) <= w.landmarkRadiusTiles
  return inRange && isReachable(state, unit, landmark) ? w.landmarkBonus : 0
}

function fallsViewTerm(state: EngineState, unit: Unit): number {
  const map = getMap(state.mapId)
  const gap = map.horizontalBuildExclusions?.[0]
  const category = itemDef(unit.kind).category
  if (!gap || !['office', 'residential', 'commerce', 'hotel'].includes(category)) {
    return 0
  }
  const unitRight = unit.x + unit.width
  const side = unitRight <= gap.xMin ? 'left' : unit.x >= gap.xMaxExclusive ? 'right' : null
  if (!side) {
    return 0
  }
  const distance = side === 'left' ? gap.xMin - unitRight : unit.x - gap.xMaxExclusive
  if (distance > TUNING.evalWeights.fallsViewRadiusTiles) {
    return 0
  }
  const blocked = unitsInIdOrder(state).some((other) => {
    if (other.id === unit.id || other.floor !== unit.floor || isSlabFamily(other.kind)) {
      return false
    }
    return side === 'left'
      ? other.x >= unitRight && other.x < gap.xMin
      : other.x + other.width <= unit.x && other.x + other.width > gap.xMaxExclusive
  })
  return blocked ? 0 : TUNING.evalWeights.fallsViewBonus
}

function affinityTerm(state: EngineState, unit: Unit): number {
  const group = itemDef(unit.kind).affinityGroup
  if (!group) {
    return 0
  }
  // "Good neighbors" must actually share the unit's walkable segment — two
  // clusters split by an elevator-only gap on the same floor aren't neighbors.
  // Skip the segment gate when the unit has no segment (unplaced/degenerate).
  const seg = segmentOf(state, unit.floor, unit.x)
  const sameFloor = state.units.filter(
    (other) =>
      other.floor === unit.floor &&
      itemDef(other.kind).affinityGroup === group &&
      (seg === null || segmentOf(state, other.floor, other.x)?.x0 === seg.x0),
  )
  return sameFloor.length >= TUNING.evalWeights.affinityMinUnits ? TUNING.evalWeights.affinityBonus : 0
}

function glassTerm(state: EngineState, unit: Unit): number {
  const w = TUNING.evalWeights
  for (const shaft of state.shafts) {
    if (shaft.kind !== 'glass') {
      continue
    }
    if (unit.floor < shaft.bottomFloor || unit.floor > shaft.topFloor) {
      continue
    }
    if (tileGap(unit.x, unit.width, shaft.x, shaftDef('glass').width) <= w.glassRadiusTiles) {
      return w.glassBonus
    }
  }
  return 0
}

function popTotal(population: Unit['population']): number {
  return population.low + population.med + population.high + population.vip
}

/**
 * Tower-global live/work gate: occupied office seats cover at least
 * liveWorkMinJobShare of residents. Identical for every unit, so occupancyPass
 * computes it once and threads it through evalBreakdown — recomputing per unit
 * would make the daily pass O(units²).
 */
function liveWorkActive(state: EngineState): boolean {
  let officeSeats = 0
  let residents = 0
  for (const other of unitsInIdOrder(state)) {
    const def = itemDef(other.kind)
    if (def.category === 'office' && other.occupied) {
      officeSeats += def.capacity ?? 0
    }
    if (def.category === 'residential' && other.occupied) {
      residents += popTotal(other.population)
    }
  }
  return officeSeats > 0 && officeSeats >= TUNING.evalWeights.liveWorkMinJobShare * residents
}

function liveWorkTerm(state: EngineState, unit: Unit, active?: boolean): number {
  if (itemDef(unit.kind).category !== 'residential') {
    return 0
  }
  return (active ?? liveWorkActive(state)) ? TUNING.evalWeights.liveWorkBonus : 0
}

function noiseTerm(state: EngineState, unit: Unit): number {
  const sensitivity = itemDef(unit.kind).noiseSensitivity ?? 0
  if (sensitivity === 0) {
    return 0
  }
  const exposure = noiseExposureAt(state, unit.floor, unit.x, unit.x + unit.width - 1, unit.id)
  return Math.min(sensitivity * exposure, TUNING.evalWeights.noiseCap)
}

/**
 * Congestion penalty from the BEST (least-congested) shaft serving the unit's
 * floor segment — riders take whichever elevator is quickest, so adding a relief
 * shaft on a jammed floor actually lowers the penalty (not just when it happens
 * to be the closest). Uses each shaft's daily PEAK wait, not the live EMA, so a
 * shaft that jams at rush but calms by the 08:00 pass still penalizes.
 */
function congestionTerm(state: EngineState, unit: Unit): number {
  const segment = segmentOf(state, unit.floor, unit.x)
  if (!segment) {
    return 0
  }
  let bestWait = Infinity
  for (const shaft of state.shafts) {
    if (!shaft.enabledStops.includes(unit.floor)) {
      continue
    }
    const width = shaftDef(shaft.kind).width
    if (shaft.x + width - 1 < segment.x0 || shaft.x > segment.x1) {
      continue
    }
    bestWait = Math.min(bestWait, shaft.stats.peakWaitGameMin)
  }
  if (bestWait === Infinity) {
    return 0
  }
  return Math.min(bestWait * TUNING.evalWeights.congestionFactor, TUNING.evalWeights.congestionCap)
}

function trashTerm(state: EngineState, unit: Unit): number {
  const w = TUNING.evalWeights
  for (const other of state.units) {
    if (other.id === unit.id || !other.flags.trashOverflow) {
      continue
    }
    if (other.floor === unit.floor && tileGap(unit.x, unit.width, other.x, other.width) <= w.trashRadiusTiles) {
      return w.trashPenalty
    }
  }
  return 0
}

/**
 * Comfort penalty for an office with no nearby same-floor restroom — a soft
 * eval drag (not a hard lease block). Graded by distance: 0 with a restroom
 * right beside it, rising to the full penalty at/beyond the serving range, so
 * central restroom placement beats "one anywhere on the floor". Only offices
 * depend on a shared restroom; residences have their own, the clinic keeps a
 * hard operating requirement.
 */
function restroomComfortTerm(state: EngineState, unit: Unit): number {
  if (itemDef(unit.kind).category !== 'office') {
    return 0
  }
  // No walkable segment → the office can't host a restroom on its floor and is
  // unroutable anyway (noRoute); don't stack a comfort drag on top.
  if (segmentOf(state, unit.floor, unit.x) === null) {
    return 0
  }
  const range = TUNING.grid.restroomRangeTiles
  const free = TUNING.evalWeights.restroomComfortFreeTiles
  const full = TUNING.evalWeights.restroomComfortPenalty
  const gap = nearestRestroomGap(state, unit)
  if (gap <= free) {
    return 0 // a restroom right on hand — no drag
  }
  if (gap >= range) {
    return full // none serving the floor — full drag
  }
  return (full * (gap - free)) / (range - free)
}

/** @param liveWork Pass occupancyPass's hoisted liveWorkActive() snapshot; omit for one-off (HUD) calls. */
export function evalBreakdown(state: EngineState, unit: Unit, liveWork?: boolean): EvalBreakdown {
  const w = TUNING.evalWeights
  const amenityBonus = amenityTerm(state, unit)
  const landmarkBonus = landmarkTerm(state, unit)
  const fallsViewBonus = fallsViewTerm(state, unit)
  const affinityBonus = affinityTerm(state, unit)
  const superLobbyBonus = w.superLobbyBonus[state.lobbyHeight] ?? 0
  const glassBonus = glassTerm(state, unit)
  const liveWorkBonus = liveWorkTerm(state, unit, liveWork)
  const noisePenalty = noiseTerm(state, unit)
  const congestionPenalty = congestionTerm(state, unit)
  const restroomComfortPenalty = restroomComfortTerm(state, unit)
  const trashPenalty = trashTerm(state, unit)
  const dirtyPenalty = unit.dirty ? w.dirtyPenalty : 0
  const incidentPenalty = unit.offline || (unit.incidentPenaltyUntilDay !== null && state.clock.day < unit.incidentPenaltyUntilDay)
    ? w.incidentPenalty
    : 0
  const parkingPenalty =
    itemDef(unit.kind).category === 'office' && parkingShortfall(state)
      ? TUNING.parking.shortfallOfficeEvalPenalty
      : 0
  const infestationPenalty = infestedNeighborPenalty(state, unit)
  const requestBonus = requestEvalBonus(state)
  const score = Math.max(
    0,
    Math.min(
      100,
      w.base +
        amenityBonus +
        landmarkBonus +
        fallsViewBonus +
        affinityBonus +
        superLobbyBonus +
        glassBonus +
        liveWorkBonus +
        requestBonus -
        noisePenalty -
        congestionPenalty -
        restroomComfortPenalty -
        trashPenalty -
        dirtyPenalty -
        incidentPenalty -
        parkingPenalty -
        infestationPenalty,
    ),
  )
  return {
    score,
    amenityBonus,
    landmarkBonus,
    fallsViewBonus,
    affinityBonus,
    superLobbyBonus,
    glassBonus,
    liveWorkBonus,
    noisePenalty,
    congestionPenalty,
    restroomComfortPenalty,
    trashPenalty,
    dirtyPenalty,
    incidentPenalty,
    parkingPenalty,
    infestationPenalty,
    requestBonus,
  }
}

export function evalUnit(state: EngineState, unit: Unit): number {
  return evalBreakdown(state, unit).score
}

// ── Flags ────────────────────────────────────────────────────────────────────

/**
 * Horizontal gap to the nearest restroom that actually serves this unit —
 * same floor AND same walkable segment (restrooms only service their own floor).
 * Infinity when none is reachable on the floor.
 */
function nearestRestroomGap(state: EngineState, unit: Unit): number {
  const segment = segmentOf(state, unit.floor, unit.x)
  if (!segment) {
    return Infinity
  }
  let best = Infinity
  for (const other of state.units) {
    if (
      other.kind !== 'restroom' ||
      other.floor !== unit.floor ||
      other.x < segment.x0 ||
      other.x + other.width - 1 > segment.x1
    ) {
      continue
    }
    const gap = tileGap(unit.x, unit.width, other.x, other.width)
    if (gap < best) {
      best = gap
    }
  }
  return best
}

function hasRestroomInRange(state: EngineState, unit: Unit): boolean {
  return nearestRestroomGap(state, unit) <= TUNING.grid.restroomRangeTiles
}

function refreshFlags(state: EngineState, unit: Unit): void {
  unit.flags.noRoute = !hasRouteToLobby(state, unit)
  const def = itemDef(unit.kind)
  if (def.category === 'office' || unit.kind === 'medicalClinic') {
    unit.flags.noRestroom = !hasRestroomInRange(state, unit)
  }
  refreshParkingFlags(state, unit) // stalls: functional = ramp-served, overrides noRoute
  refreshHotelRoomFlags(state, unit) // rooms: reception dependency + vacant-room reasons
}

// ── Vacancy reasons ──────────────────────────────────────────────────────────

const TOO_NOISY_THRESHOLD = 15
const RESTROOM_THRESHOLD = 15

function dominantVacancyReason(unit: Unit, breakdown: EvalBreakdown, fallback: VacancyReason): VacancyReason {
  if (unit.flags.noRoute) {
    return 'noRoute'
  }
  // Restroom is now a soft penalty, so attribute the vacancy to it only when the
  // comfort drag is severe (no reachable restroom on the floor) — a mild penalty
  // shouldn't mask noise/congestion as the real cause.
  if (breakdown.restroomComfortPenalty >= RESTROOM_THRESHOLD) {
    return 'noRestroom'
  }
  if (breakdown.noisePenalty >= TOO_NOISY_THRESHOLD) {
    return 'tooNoisy'
  }
  if (breakdown.congestionPenalty >= ELEVATOR_CROWDED_WAIT_MIN) {
    return 'elevatorCrowded'
  }
  const thresholds = TUNING.rent.leasabilityThreshold
  if (breakdown.score >= thresholds.avg && breakdown.score < thresholds[unit.rentTier]) {
    return 'rentTooHigh'
  }
  return fallback
}

export function vacateUnit(unit: Unit, reason: VacancyReason, events: EngineEvent[]): void {
  const { floor, id: unitId, kind: unitKind } = unit
  unit.occupied = false
  unit.population = { low: 0, med: 0, high: 0, vip: 0 }
  unit.vacancyReason = reason
  unit.lowEvalDays = 0
  events.push({ type: 'unitVacated', unitId, unitKind, floor, reason })
}

// ── Leasing ──────────────────────────────────────────────────────────────────

function fillPopulation(state: EngineState, unit: Unit): void {
  const capacity = itemDef(unit.kind).capacity ?? 0
  const mix = TUNING.rent.tenantTierMix[unit.rentTier]
  const entries = (['low', 'med', 'high'] as const)
    .map((tier) => ({ value: tier as IncomeTier, weight: mix[tier] }))
    .filter((entry) => entry.weight > 0)
  for (let i = 0; i < capacity; i++) {
    const tier = pickWeighted(state.rng, entries)
    unit.population[tier] += 1
  }
}

function tryLease(state: EngineState, unit: Unit, events: EngineEvent[]): void {
  const def = itemDef(unit.kind)
  if (unit.offline || unit.infested) {
    return
  }
  if (def.category === 'office' && isWeekend(state.clock.day)) {
    return
  }
  // A missing restroom is no longer a hard lease block — it's a graded eval
  // penalty (restroomComfortTerm), so an otherwise-desirable office still
  // leases, just lower. Only a broken route to the lobby hard-blocks leasing.
  if (unit.flags.noRoute) {
    return
  }
  if (unit.evalScore < TUNING.rent.leasabilityThreshold[unit.rentTier]) {
    return
  }
  unit.occupied = true
  unit.vacancyReason = null
  unit.lowEvalDays = 0
  fillPopulation(state, unit)
  events.push({ type: 'unitLeased', unitId: unit.id })
}

// ── Passes ───────────────────────────────────────────────────────────────────

/**
 * Evict tenants whose unit can no longer reach a ground lobby. Called
 * immediately after any structure change that can sever routes (demolition,
 * disabling an elevator stop) and at the daily pass — a tenant with no way in
 * or out doesn't wait days to leave. VIP homes are exempt (the VIP system owns
 * their move-outs); commerce/services flip `occupied` at the daily pass as
 * before. `flags.noRoute` is stamped so the issues badge and lease block agree
 * without waiting for the next daily flag refresh.
 */
export function vacateUnroutableUnits(state: EngineState, events: EngineEvent[]): void {
  for (const unit of unitsInIdOrder(state)) {
    if (isSlabFamily(unit.kind) || !unit.occupied || unit.population.vip > 0) {
      continue
    }
    const category = itemDef(unit.kind).category
    const tenant = category === 'office' || category === 'residential' || HOTEL_ROOM_KINDS.has(unit.kind)
    if (!tenant) {
      continue
    }
    if (!hasRouteToLobby(state, unit)) {
      unit.flags.noRoute = true
      vacateUnit(unit, 'noRoute', events)
    }
  }
}

/** Daily 08:00 pass: refresh flags, recompute evals, lease vacants, vacate 3-day-low units. */
export function occupancyPass(state: EngineState, events: EngineEvent[]): void {
  const units = unitsInIdOrder(state)
  for (const unit of units) {
    if (!isSlabFamily(unit.kind)) {
      refreshFlags(state, unit)
    }
  }
  vacateUnroutableUnits(state, events)
  const liveWork = liveWorkActive(state)
  for (const unit of units) {
    if (isSlabFamily(unit.kind)) {
      continue
    }
    const breakdown = evalBreakdown(state, unit, liveWork)
    unit.evalScore = breakdown.score
    const def = itemDef(unit.kind)
    const category = def.category
    if (category === 'commerce') {
      unit.occupied = !unit.flags.noRoute
      continue
    }
    if (def.operates) {
      // Service earners (clinic) operate when routable, and — unlike commerce —
      // require a nearby restroom to stay open.
      unit.occupied = !unit.flags.noRoute && !unit.flags.noRestroom
      continue
    }
    if (category !== 'office' && category !== 'residential') {
      continue
    }
    if (!unit.occupied) {
      tryLease(state, unit, events)
      continue
    }
    if (breakdown.score < TUNING.rent.leasabilityThreshold[unit.rentTier]) {
      unit.lowEvalDays += 1
      if (unit.lowEvalDays >= TUNING.stress.lowEvalRiskDays) {
        vacateUnit(unit, dominantVacancyReason(unit, breakdown, 'lowEval'), events)
      }
    } else {
      unit.lowEvalDays = 0
    }
  }
  // Reset the daily wait peak AFTER every unit has been evaluated, so each pass
  // reads the peak over the full preceding ~24h (both rushes) and the next
  // window starts clean. Must live here — never inside congestionTerm, which is
  // a pure read called live from the inspect panel and the weekly stress pass.
  // A zero peak means the shaft saw no boardings this window (sampleWaitStat
  // only fires on boarding), so relax its stale live avg toward 0 — otherwise a
  // shaft whose traffic source was demolished shows phantom congestion on the
  // heatmap forever and can re-seed a high peak from one sparse future boarding.
  for (const shaft of state.shafts) {
    if (shaft.stats.peakWaitGameMin === 0) {
      shaft.stats.avgWaitGameMin *= 1 - TUNING.elevators.idleWaitDecayPerPass
    }
    shaft.stats.peakWaitGameMin = 0
  }
}

/**
 * End-of-week vacancy from stress marks (marks ≥ ceil(base × tolerance)); marks
 * reset for everyone afterwards. Marks accrue from Phase 4's patience expiries;
 * stress-driven move-outs default to 'elevatorCrowded' (the classic cause)
 * unless a flag/penalty dominates.
 */
export function weeklyStressPass(state: EngineState, events: EngineEvent[]): void {
  vipWeeklyPass(state, events) // runs FIRST so resident VIPs still see this week's marks
  for (const unit of unitsInIdOrder(state)) {
    const category = itemDef(unit.kind).category
    // VIP homes vacate only through the VIP system (population.vip > 0 guard).
    if (unit.occupied && unit.population.vip === 0 && (category === 'office' || category === 'residential')) {
      const threshold = weeklyStressThreshold(unit.rentTier)
      if (unit.stressMarks >= threshold) {
        vacateUnit(unit, dominantVacancyReason(unit, evalBreakdown(state, unit), 'elevatorCrowded'), events)
      }
    }
    unit.stressMarks = 0
  }
}
