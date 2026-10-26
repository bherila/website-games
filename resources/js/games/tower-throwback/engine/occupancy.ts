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
  Shaft,
  Unit,
  VacancyReason,
} from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef, shaftDef } from './catalog'
import { isWeekend } from './clock'
import { getSegments, isSlabFamily, type Segment } from './grid'
import { noiseExposureAt } from './heatmaps'
import { hotelReceptionExists, refreshHotelRoomFlags } from './hotel'
import { infestedNeighborPenalty, requestEvalBonus } from './incidents'
import { getMap } from './maps'
import { functionalStalls, rampServedFloors, refreshParkingFlags } from './parking'
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

// ── Per-pass unit index ─────────────────────────────────────────────────────

/**
 * The units each eval term looks at, bucketed once instead of rescanned for
 * every unit (the old full scans made the daily pass grow with the square of
 * the unit count). Only MEMBERSHIP is indexed — which units exist, of what
 * kind, on which floor — and that cannot change while a pass runs (it adds and
 * removes no units). Every value a term reads (flags, occupancy, offline,
 * population) is still read live from the unit, every list keeps id order, and
 * candidate lists are supersets of the units the old scans counted, so each
 * term returns exactly what the scan did. Noise sums add the same terms in the
 * same id order, so even the floating-point totals match bit for bit.
 *
 * The one live aggregate, the occupied-office count behind the parking
 * shortfall, is kept current with `noteOccupancyChange` as units lease and
 * vacate during the pass.
 */
export interface OccupancyIndex {
  byFloor: ReadonlyMap<number, readonly Unit[]>
  restroomsByFloor: ReadonlyMap<number, readonly Unit[]>
  /** Amenity sources (AMENITY_BONUS kinds) within amenity reach of a floor, id order. */
  amenitiesNear: (floor: number) => readonly Unit[]
  /** Noise sources within propagation reach of a floor, id order. */
  noiseNear: (floor: number) => readonly Unit[]
  conferenceCenters: number
  eventSpaces: number
  landmarkCandidates: readonly Unit[]
  infested: readonly Unit[]
  rampServedFloors: ReadonlySet<number>
  receptionExists: boolean
  parkingShortfall: () => boolean
  noteOccupancyChange: (unit: Unit, wasOccupied: boolean) => void
}

function pushTo(map: Map<number, Unit[]>, floor: number, unit: Unit): void {
  const list = map.get(floor)
  if (list) {
    list.push(unit)
  } else {
    map.set(floor, [unit])
  }
}

/** Units from floors [floor − reach, floor + reach], merged back into id order. */
function nearFloors(byFloor: ReadonlyMap<number, readonly Unit[]>, floor: number, reach: number): Unit[] {
  const merged: Unit[] = []
  for (let f = floor - reach; f <= floor + reach; f += 1) {
    const list = byFloor.get(f)
    if (list) {
      merged.push(...list)
    }
  }
  return merged.sort((a, b) => a.id - b.id)
}

export function buildOccupancyIndex(state: EngineState): OccupancyIndex {
  const byFloor = new Map<number, Unit[]>()
  const restroomsByFloor = new Map<number, Unit[]>()
  const amenitiesByFloor = new Map<number, Unit[]>()
  const noiseByFloor = new Map<number, Unit[]>()
  const landmarkKind = getMap(state.mapId).endgameItem
  const landmarkCandidates: Unit[] = []
  const infested: Unit[] = []
  let conferenceCenters = 0
  let eventSpaces = 0
  let suites = 0
  let occupiedOffices = 0
  for (const unit of unitsInIdOrder(state)) {
    pushTo(byFloor, unit.floor, unit)
    const def = itemDef(unit.kind)
    if (unit.kind === 'restroom') {
      pushTo(restroomsByFloor, unit.floor, unit)
    }
    if (AMENITY_BONUS[unit.kind] !== undefined) {
      pushTo(amenitiesByFloor, unit.floor, unit)
    }
    if (def.noise) {
      pushTo(noiseByFloor, unit.floor, unit)
    }
    if (unit.kind === landmarkKind) {
      landmarkCandidates.push(unit)
    }
    if (unit.infested) {
      infested.push(unit)
    }
    if (unit.kind === 'conferenceCenter') {
      conferenceCenters += 1
    } else if (unit.kind === 'eventSpace') {
      eventSpaces += 1
    } else if (unit.kind === 'hotelSuite') {
      suites += 1
    }
    if (def.category === 'office' && unit.occupied) {
      occupiedOffices += 1
    }
  }
  const rampServed = rampServedFloors(state)
  const stalls = functionalStalls(state).length
  const amenityMemo = new Map<number, Unit[]>()
  const noiseMemo = new Map<number, Unit[]>()
  const noiseReach = TUNING.noise.floorPropagation.length - 1
  return {
    byFloor,
    restroomsByFloor,
    amenitiesNear: (floor) => {
      let list = amenityMemo.get(floor)
      if (!list) {
        list = nearFloors(amenitiesByFloor, floor, TUNING.evalWeights.amenityRadiusFloors)
        amenityMemo.set(floor, list)
      }
      return list
    },
    noiseNear: (floor) => {
      let list = noiseMemo.get(floor)
      if (!list) {
        list = nearFloors(noiseByFloor, floor, noiseReach)
        noiseMemo.set(floor, list)
      }
      return list
    },
    conferenceCenters,
    eventSpaces,
    landmarkCandidates,
    infested,
    rampServedFloors: rampServed,
    receptionExists: hotelReceptionExists(state),
    // Same rule as parking.parkingShortfall, from counts instead of a scan.
    parkingShortfall: () => {
      if (state.maxStarReached < 3) {
        return false
      }
      const demand = suites * TUNING.parking.spacesPerSuite + Math.floor(occupiedOffices / TUNING.parking.officesPerSpace)
      return demand > 0 && stalls < demand
    },
    noteOccupancyChange: (unit, wasOccupied) => {
      if (unit.occupied !== wasOccupied && itemDef(unit.kind).category === 'office') {
        occupiedOffices += unit.occupied ? 1 : -1
      }
    },
  }
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

function amenityTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
  const w = TUNING.evalWeights
  const category = itemDef(unit.kind).category
  let bonus = 0
  for (const other of index.amenitiesNear(unit.floor)) {
    if (other.id === unit.id) {
      continue
    }
    const perSource = AMENITY_BONUS[other.kind] ?? 0
    const inRange =
      Math.abs(other.floor - unit.floor) <= w.amenityRadiusFloors &&
      tileGap(unit.x, unit.width, other.x, other.width) <= w.amenityRadiusTiles &&
      isReachable(state, unit, other)
    if (inRange) {
      bonus += perSource
    }
  }
  // Tower-wide boons: +5 per conference center for offices, per event space for
  // hotel rooms (neither kind is itself an office or a hotel room).
  if (category === 'office') {
    bonus += 5 * index.conferenceCenters
  }
  if (HOTEL_ROOM_KINDS.has(unit.kind)) {
    bonus += 5 * index.eventSpaces
  }
  return Math.min(bonus, w.amenityCap)
}

/** Nearby, reachable occupiable units benefit from the active map's standing masterpiece. */
function landmarkTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
  const category = itemDef(unit.kind).category
  if (!['office', 'residential', 'commerce', 'hotel'].includes(category)) {
    return 0
  }
  const landmark = index.landmarkCandidates.find(
    (other) => !other.offline && !other.infested && !other.flags.noRoute,
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

function fallsViewTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
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
  const blocked = (index.byFloor.get(unit.floor) ?? []).some((other) => {
    if (other.id === unit.id || other.floor !== unit.floor || isSlabFamily(other.kind)) {
      return false
    }
    return side === 'left'
      ? other.x >= unitRight && other.x < gap.xMin
      : other.x + other.width <= unit.x && other.x + other.width > gap.xMaxExclusive
  })
  return blocked ? 0 : TUNING.evalWeights.fallsViewBonus
}

function affinityTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
  const group = itemDef(unit.kind).affinityGroup
  if (!group) {
    return 0
  }
  // "Good neighbors" must actually share the unit's walkable segment — two
  // clusters split by an elevator-only gap on the same floor aren't neighbors.
  // Skip the segment gate when the unit has no segment (unplaced/degenerate).
  const seg = segmentOf(state, unit.floor, unit.x)
  const sameFloor = (index.byFloor.get(unit.floor) ?? []).filter(
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

function noiseTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
  const sensitivity = itemDef(unit.kind).noiseSensitivity ?? 0
  if (sensitivity === 0) {
    return 0
  }
  const exposure = noiseExposureAt(state, unit.floor, unit.x, unit.x + unit.width - 1, unit.id, index.noiseNear(unit.floor))
  return Math.min(sensitivity * exposure, TUNING.evalWeights.noiseCap)
}

/**
 * The wait a shaft's riders have recently faced: the worst daily peak over the
 * last `congestionHistoryDays` windows (the current one included). A single
 * daily window let the Monday pass read Sunday — offices closed, empty cars —
 * and re-lease every unit the weekly stress pass had just emptied.
 */
export function recentPeakWait(shaft: Shaft): number {
  let worst = shaft.stats.peakWaitGameMin
  for (const peak of shaft.stats.dailyPeaksGameMin ?? []) {
    worst = Math.max(worst, peak)
  }
  return worst
}

/**
 * Congestion penalty from the elevators this unit's commuters actually ride:
 * the elevator legs of the route from the street entrance to the unit's floor
 * segment (a fresh, cache-bypassing search, so the answer never depends on the
 * non-serialized path memo). The worst recent peak among those legs counts.
 *
 * It used to take the least-congested shaft with a stop on the segment, on
 * the theory that riders pick the quickest elevator — but routing is
 * load-blind, so an untouched shaft on the floor (ties go to the lowest shaft
 * id) zeroed the penalty for every unit while the shaft people did use jammed.
 */
function congestionTerm(state: EngineState, unit: Unit): number {
  const segment = segmentOf(state, unit.floor, unit.x)
  if (!segment) {
    return 0
  }
  return congestionPenaltyForSegment(state, segment)
}

/**
 * Where commuters enter: the left edge of the first anchor-floor segment, the
 * same point as `people.streetEntrance` (not imported: people → economy →
 * occupancy would form an import cycle).
 */
function commuteEntrance(state: EngineState): Segment | null {
  return getSegments(state).get(getMap(state.mapId).lobbyAnchorFloor)?.[0] ?? null
}

interface CommuteShaftCache {
  structureVersion: number
  bySegment: Map<string, readonly Shaft[]>
}

/**
 * Commute shafts per floor segment, derived purely from the structure and
 * dropped whenever `structureVersion` moves. It is not the router's path memo
 * (which remembers whichever endpoints asked first and is not saved), so a
 * restored game computes the same answer as an uninterrupted one.
 */
const commuteShaftCache = new WeakMap<EngineState, CommuteShaftCache>()

function commuteShafts(state: EngineState, segment: Segment): readonly Shaft[] {
  let cache = commuteShaftCache.get(state)
  if (!cache || cache.structureVersion !== state.structureVersion) {
    cache = { structureVersion: state.structureVersion, bySegment: new Map() }
    commuteShaftCache.set(state, cache)
  }
  const key = `${segment.floor}:${segment.x0}`
  const cached = cache.bySegment.get(key)
  if (cached) {
    return cached
  }
  const entrance = commuteEntrance(state)
  const route = entrance
    ? findRoute(state, entrance.floor, entrance.x0, segment.floor, segment.x0, { bypassCache: true })
    : null
  const shafts: Shaft[] = []
  for (const leg of route ?? []) {
    if (leg.type !== 'elevator' || leg.shaftId === undefined) {
      continue
    }
    const shaft = state.shafts.find((candidate) => candidate.id === leg.shaftId)
    if (shaft) {
      shafts.push(shaft)
    }
  }
  cache.bySegment.set(key, shafts)
  return shafts
}

function congestionPenaltyForSegment(state: EngineState, segment: Segment): number {
  let worstWait = 0
  for (const shaft of commuteShafts(state, segment)) {
    worstWait = Math.max(worstWait, recentPeakWait(shaft))
  }
  return Math.min(worstWait * TUNING.evalWeights.congestionFactor, TUNING.evalWeights.congestionCap)
}

function trashTerm(unit: Unit, index: OccupancyIndex): number {
  const w = TUNING.evalWeights
  for (const other of index.byFloor.get(unit.floor) ?? []) {
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
function restroomComfortTerm(state: EngineState, unit: Unit, index: OccupancyIndex): number {
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
  const gap = nearestRestroomGap(state, unit, index)
  if (gap <= free) {
    return 0 // a restroom right on hand — no drag
  }
  if (gap >= range) {
    return full // none serving the floor — full drag
  }
  return (full * (gap - free)) / (range - free)
}

/**
 * @param liveWork Pass occupancyPass's hoisted liveWorkActive() snapshot; omit for one-off (HUD) calls.
 * @param index The pass's unit index; omitted, a fresh one is built (O(units), the same as one old scan).
 */
export function evalBreakdown(state: EngineState, unit: Unit, liveWork?: boolean, index?: OccupancyIndex): EvalBreakdown {
  const idx = index ?? buildOccupancyIndex(state)
  const w = TUNING.evalWeights
  const amenityBonus = amenityTerm(state, unit, idx)
  const landmarkBonus = landmarkTerm(state, unit, idx)
  const fallsViewBonus = fallsViewTerm(state, unit, idx)
  const affinityBonus = affinityTerm(state, unit, idx)
  const superLobbyBonus = w.superLobbyBonus[state.lobbyHeight] ?? 0
  const glassBonus = glassTerm(state, unit)
  const liveWorkBonus = liveWorkTerm(state, unit, liveWork)
  const noisePenalty = noiseTerm(state, unit, idx)
  const congestionPenalty = congestionTerm(state, unit)
  const restroomComfortPenalty = restroomComfortTerm(state, unit, idx)
  const trashPenalty = trashTerm(unit, idx)
  const dirtyPenalty = unit.dirty ? w.dirtyPenalty : 0
  const incidentPenalty = unit.offline || (unit.incidentPenaltyUntilDay !== null && state.clock.day < unit.incidentPenaltyUntilDay)
    ? w.incidentPenalty
    : 0
  const parkingPenalty =
    itemDef(unit.kind).category === 'office' && idx.parkingShortfall()
      ? TUNING.parking.shortfallOfficeEvalPenalty
      : 0
  const infestationPenalty = infestedNeighborPenalty(state, unit, idx.infested)
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
function nearestRestroomGap(state: EngineState, unit: Unit, index: OccupancyIndex): number {
  const segment = segmentOf(state, unit.floor, unit.x)
  if (!segment) {
    return Infinity
  }
  let best = Infinity
  for (const other of index.restroomsByFloor.get(unit.floor) ?? []) {
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

function hasRestroomInRange(state: EngineState, unit: Unit, index: OccupancyIndex): boolean {
  return nearestRestroomGap(state, unit, index) <= TUNING.grid.restroomRangeTiles
}

function refreshFlags(state: EngineState, unit: Unit, index: OccupancyIndex): void {
  unit.flags.noRoute = !hasRouteToLobby(state, unit)
  const def = itemDef(unit.kind)
  if (def.category === 'office' || unit.kind === 'medicalClinic') {
    unit.flags.noRestroom = !hasRestroomInRange(state, unit, index)
  }
  refreshParkingFlags(state, unit, index.rampServedFloors) // stalls: functional = ramp-served, overrides noRoute
  refreshHotelRoomFlags(state, unit, index.receptionExists) // rooms: reception dependency + vacant-room reasons
}

// ── Vacancy reasons ──────────────────────────────────────────────────────────

const TOO_NOISY_THRESHOLD = 15

function dominantVacancyReason(unit: Unit, breakdown: EvalBreakdown, fallback: VacancyReason): VacancyReason {
  if (unit.flags.noRoute) {
    return 'noRoute'
  }
  // Restroom is now a soft penalty, so attribute the vacancy to it only when the
  // comfort drag is at its full value (no restroom serving the office) — a mild
  // penalty shouldn't mask noise/congestion as the real cause. The full value is
  // the TUNING weight itself; a fixed bar above it could never be reached.
  if (breakdown.restroomComfortPenalty >= TUNING.evalWeights.restroomComfortPenalty) {
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

function tryLease(state: EngineState, unit: Unit, breakdown: EvalBreakdown, events: EngineEvent[]): void {
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
    // Name the blocker the same way a move-out is explained, so a unit that has
    // never leased is not a silent dead end. State only — no event, no rng.
    unit.vacancyReason = dominantVacancyReason(unit, breakdown, 'lowEval')
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
  const index = buildOccupancyIndex(state)
  for (const unit of units) {
    if (!isSlabFamily(unit.kind)) {
      refreshFlags(state, unit, index)
    }
  }
  vacateUnroutableUnits(state, events)
  // vacateUnroutableUnits may have emptied offices; the index counted before it.
  const settled = buildOccupancyIndex(state)
  const liveWork = liveWorkActive(state)
  for (const unit of units) {
    if (isSlabFamily(unit.kind)) {
      continue
    }
    const wasOccupied = unit.occupied
    settleUnit(state, unit, liveWork, settled, events)
    settled.noteOccupancyChange(unit, wasOccupied)
  }
  // Reset the daily wait peak AFTER every unit has been evaluated, so each pass
  // reads the peak over the full preceding ~24h (both rushes) and the next
  // window starts clean. Must live here — never inside congestionTerm, which is
  // a pure read called live from the inspect panel and the weekly stress pass.
  // A zero peak means the shaft saw no boardings this window (sampleWaitStat
  // only fires on boarding), so relax its stale live avg toward 0 — otherwise a
  // shaft whose traffic source was demolished shows phantom congestion on the
  // heatmap forever and can re-seed a high peak from one sparse future boarding.
  // The closing window's peak joins the week of history the congestion term
  // reads (newest first, bounded), then a fresh window starts.
  const historyLength = TUNING.evalWeights.congestionHistoryDays - 1
  for (const shaft of state.shafts) {
    if (shaft.stats.peakWaitGameMin === 0) {
      shaft.stats.avgWaitGameMin *= 1 - TUNING.elevators.idleWaitDecayPerPass
    }
    shaft.stats.dailyPeaksGameMin = [shaft.stats.peakWaitGameMin, ...(shaft.stats.dailyPeaksGameMin ?? [])].slice(0, historyLength)
    shaft.stats.peakWaitGameMin = 0
  }
}

/** Evaluate one unit at the daily pass and lease, keep, or vacate it. */
function settleUnit(state: EngineState, unit: Unit, liveWork: boolean, index: OccupancyIndex, events: EngineEvent[]): void {
  const breakdown = evalBreakdown(state, unit, liveWork, index)
  unit.evalScore = breakdown.score
  const def = itemDef(unit.kind)
  const category = def.category
  if (category === 'commerce') {
    unit.occupied = !unit.flags.noRoute
    return
  }
  if (def.operates) {
    // Service earners (clinic) operate when routable, and — unlike commerce —
    // require a nearby restroom to stay open.
    unit.occupied = !unit.flags.noRoute && !unit.flags.noRestroom
    return
  }
  if (category !== 'office' && category !== 'residential') {
    return
  }
  if (!unit.occupied) {
    tryLease(state, unit, breakdown, events)
    return
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
