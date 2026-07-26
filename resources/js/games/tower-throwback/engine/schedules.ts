/**
 * Schedules — converts tenancy into journeys on minute boundaries.
 *
 * Population counters are TENANCY and are never touched here (see people.ts);
 * a "worker arriving" is a fresh Person whose tenantUnitId points at the
 * office. Deterministic distribution: the i-th of n commuters moves at
 * `windowStart + floor((i + 0.5) × window / n)` — uniform, rng-free.
 *
 * rng consumption (fixed order — units ascending id, people in loop order):
 * lunch accept/minute rolls (at 11:30), weekend errand accept/minute rolls
 * (at 10:00), shopper tier/destination/dwell/spawn-source rolls (hourly).
 * The spawn-source roll only happens when the map lists a subway source AND a
 * subway station exists — single-source maps consume no rng there.
 *
 * Pending same-day spawns (lunch/errand rolls resolved in advance) live in a
 * per-state WeakMap keyed by minute-of-day and are included in save snapshots.
 */

import type { EngineEvent, EngineState, IncomeTier, ItemKind, TierCounts, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef } from './catalog'
import { isWeekend, MINUTES_PER_DAY } from './clock'
import { postImmediate } from './economy'
import { stepHotelMinute } from './hotel'
import { generateRequest, INCIDENT_CHECK_MINUTE, REQUEST_GENERATION_MINUTE, stepIncidentMinute, stepIncidents } from './incidents'
import { isAnchorFloor } from './mapGeometry'
import { getMap } from './maps'
import { claimStall, clearAllStalls, releaseStall, takeParkedStall } from './parking'
import { spawnPerson, streetEntrance } from './people'
import { pickWeighted, randomInt } from './rng'
import { findRoute } from './routing'
import { generateDailyTrash, haulTrash, TRASH_HAUL_MINUTE } from './trash'
import { stepVipMinute } from './vip'

const OFFICE_ARRIVE = { start: 7 * 60, end: 9 * 60 + 30 }
const OFFICE_DEPART = { start: 17 * 60, end: 19 * 60 }
const RESIDENT_DEPART = { start: 7 * 60, end: 9 * 60 }
const RESIDENT_RETURN = { start: 17 * 60 + 30, end: 19 * 60 + 30 }
const LUNCH_START = 11 * 60 + 30
const LUNCH_END = 13 * 60 + 30
const ERRAND_START = 10 * 60
const ERRAND_END = 20 * 60
const ERRAND_AWAY_MIN = 90
const SHOPPER_FIRST_HOUR = 10
const SHOPPER_LAST_HOUR = 20
const LUNCH_DWELL_MIN = 30
const DINER_FIRST_HOUR = 17
const DINER_LAST_HOUR = 20
const DINER_DWELL_MIN = 40
const THEATER_DWELL_MIN = 90
const AMENITY_PLAN_MINUTE = 8 * 60 + 30
const AMENITY_DWELL_MIN = 45
const RESIDENT_AMENITY = { start: 17 * 60, end: 20 * 60 }
const GUEST_AMENITY = { start: 9 * 60, end: 11 * 60 }
const CONFERENCE_MINUTES = [9 * 60, 13 * 60]
const CONFERENCE_DWELL_MIN = 120
const EVENT_DWELL_MIN = 120

const FOOD_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['fastfood', 'foodCourt', 'restaurant', 'fancyRestaurant'])

export interface PendingSpawn {
  tier: IncomeTier
  floor: number
  x: number
  toFloor: number
  toX: number
  purpose: 'lunch' | 'errand' | 'amenity'
  tenantUnitId: number | null
  destUnitId: number | null
  dwellMin?: number
}

interface ScheduleAux {
  pending: Map<number, PendingSpawn[]>
}

export interface ScheduleRuntimeSnapshot {
  pending: Array<[number, PendingSpawn[]]>
}

const auxMap = new WeakMap<EngineState, ScheduleAux>()

function getAux(state: EngineState): ScheduleAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { pending: new Map() }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotScheduleRuntime(state: EngineState): ScheduleRuntimeSnapshot {
  return {
    pending: [...getAux(state).pending.entries()].map(([minute, spawns]) => [minute, spawns.map((spawn) => ({ ...spawn }))]),
  }
}

export function restoreScheduleRuntime(state: EngineState, snapshot: ScheduleRuntimeSnapshot): void {
  auxMap.set(state, {
    pending: new Map(snapshot.pending.map(([minute, spawns]) => [minute, spawns.map((spawn) => ({ ...spawn }))])),
  })
}

function schedulePending(state: EngineState, minute: number, spawn: PendingSpawn): void {
  const aux = getAux(state)
  const list = aux.pending.get(minute)
  if (list) {
    list.push(spawn)
  } else {
    aux.pending.set(minute, [spawn])
  }
}

const STALL_RESET_MINUTE = 3 * 60

/** The subway spawn point, when the map lists a subway source AND one is built. */
function subwayEntrance(state: EngineState): { floor: number; x: number } | null {
  const map = getMap(state.mapId)
  if (!map.spawnSources.some((s) => s.type === 'subway')) {
    return null
  }
  const subway = state.units.find((u) => u.kind === 'subway' && !u.offline)
  return subway ? { floor: subway.floor, x: subway.x } : null
}

/** Occasional subway split for shoppers — only rolls rng when a split exists. */
function spawnSource(state: EngineState): { floor: number; x: number } | null {
  const map = getMap(state.mapId)
  const street = streetEntrance(state)
  const subwaySource = map.spawnSources.find((s) => s.type === 'subway')
  if (subwaySource) {
    const subway = subwayEntrance(state)
    if (subway && state.rng.next() < subwaySource.share) {
      return subway
    }
  }
  return street
}

/** Deterministic index split: worker i commutes via subway when the share accumulator ticks. */
function viaSubwayByIndex(i: number): boolean {
  const share = TUNING.spawn.subwayShare
  return Math.floor((i + 1) * share) > Math.floor(i * share)
}

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

function popTotal(pop: TierCounts): number {
  return pop.low + pop.med + pop.high + pop.vip
}

/** Tier of the i-th occupant when the TierCounts are laid out low→med→high→vip. */
function tierOfIndex(pop: TierCounts, i: number): IncomeTier {
  if (i < pop.low) {
    return 'low'
  }
  if (i < pop.low + pop.med) {
    return 'med'
  }
  if (i < pop.low + pop.med + pop.high) {
    return 'high'
  }
  return 'vip'
}

function commuteMinute(window: { start: number; end: number }, i: number, n: number): number {
  return window.start + Math.floor(((i + 0.5) * (window.end - window.start)) / n)
}

function affordsFood(tier: IncomeTier, kind: ItemKind): boolean {
  if (kind === 'fastfood' || kind === 'foodCourt') {
    return true
  }
  if (kind === 'restaurant') {
    return tier !== 'low'
  }
  return tier === 'high' || tier === 'vip'
}

function operatingCommerce(state: EngineState): Unit[] {
  return unitsInIdOrder(state).filter(
    (u) => itemDef(u.kind).category === 'commerce' && u.occupied && !u.offline && !u.infested,
  )
}

// ── Minute handlers ──────────────────────────────────────────────────────────

/**
 * Office commutes with Phase 8 sources: med/high workers park first-come at
 * functional stalls (car-commuter share emerges from stall supply), a
 * deterministic subwayShare of the rest arrive via the subway when one exists,
 * everyone else uses the street. Evening reverses: departing med/high workers
 * reclaim their office's parked stalls before falling back to the street.
 */
function officeCommutes(state: EngineState, minute: number): void {
  const entrance = streetEntrance(state)
  if (!entrance) {
    return
  }
  const subway = subwayEntrance(state)
  for (const unit of unitsInIdOrder(state)) {
    if (itemDef(unit.kind).category !== 'office' || !unit.occupied) {
      continue
    }
    const n = popTotal(unit.population)
    for (let i = 0; i < n; i++) {
      const tier = tierOfIndex(unit.population, i)
      if (commuteMinute(OFFICE_ARRIVE, i, n) === minute) {
        let source: { floor: number; x: number } = entrance
        if (tier === 'med' || tier === 'high') {
          const stall = claimStall(state, unit.id, tier)
          if (stall) {
            if (findRoute(state, stall.floor, stall.x, unit.floor, unit.x) !== null) {
              source = { floor: stall.floor, x: stall.x }
            } else {
              releaseStall(state, unit.id, stall.id) // garage not connected — walk instead
            }
          }
        }
        if (source === entrance && subway && viaSubwayByIndex(i)) {
          if (findRoute(state, subway.floor, subway.x, unit.floor, unit.x) !== null) {
            source = subway
          }
        }
        spawnPerson(state, {
          tier,
          floor: source.floor,
          x: source.x,
          toFloor: unit.floor,
          toX: unit.x,
          purpose: 'commuteIn',
          tenantUnitId: unit.id,
          destUnitId: unit.id,
        })
      }
      if (commuteMinute(OFFICE_DEPART, i, n) === minute) {
        let dest: { floor: number; x: number } = entrance
        let destUnitId: number | null = null
        if (tier === 'med' || tier === 'high') {
          const stall = takeParkedStall(state, unit.id)
          if (stall) {
            dest = { floor: stall.floor, x: stall.x }
            destUnitId = stall.id
          }
        }
        spawnPerson(state, {
          tier,
          floor: unit.floor,
          x: unit.x,
          toFloor: dest.floor,
          toX: dest.x,
          purpose: 'commuteOut',
          tenantUnitId: unit.id,
          destUnitId,
        })
      }
    }
  }
}

function residentCommutes(state: EngineState, minute: number): void {
  const entrance = streetEntrance(state)
  if (!entrance) {
    return
  }
  for (const unit of unitsInIdOrder(state)) {
    if (itemDef(unit.kind).category !== 'residential' || !unit.occupied) {
      continue
    }
    const commuters = Math.round(popTotal(unit.population) * TUNING.spawn.residentCommuteShare)
    for (let i = 0; i < commuters; i++) {
      if (commuteMinute(RESIDENT_DEPART, i, commuters) === minute) {
        spawnPerson(state, {
          tier: tierOfIndex(unit.population, i),
          floor: unit.floor,
          x: unit.x,
          toFloor: entrance.floor,
          toX: entrance.x,
          purpose: 'commuteOut',
          tenantUnitId: unit.id,
        })
      }
      if (commuteMinute(RESIDENT_RETURN, i, commuters) === minute) {
        spawnPerson(state, {
          tier: tierOfIndex(unit.population, i),
          floor: entrance.floor,
          x: entrance.x,
          toFloor: unit.floor,
          toX: unit.x,
          purpose: 'commuteIn',
          tenantUnitId: unit.id,
          destUnitId: unit.id,
        })
      }
    }
  }
}

function nearestAffordableFood(state: EngineState, from: Unit, tier: IncomeTier): Unit | null {
  let best: Unit | null = null
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity]
  for (const unit of operatingCommerce(state)) {
    if (!FOOD_KINDS.has(unit.kind) || !affordsFood(tier, unit.kind)) {
      continue
    }
    // Only rank food the worker can actually reach. Otherwise a geometrically
    // nearer but unreachable venue wins and the worker just skips lunch
    // (spawnPerson no-ops on a null route) even when a reachable venue exists
    // one floor further. findRoute is cached per structureVersion → deterministic.
    if (findRoute(state, from.floor, from.x, unit.floor, unit.x) === null) {
      continue
    }
    const key: [number, number, number] = [Math.abs(unit.floor - from.floor), Math.abs(unit.x - from.x), unit.id]
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = unit
      bestKey = key
    }
  }
  return best
}

/** 11:30 — roll each worker's lunch trip once (rng: accept + minute offset). */
function rollLunchTrips(state: EngineState): void {
  for (const unit of unitsInIdOrder(state)) {
    if (itemDef(unit.kind).category !== 'office' || !unit.occupied) {
      continue
    }
    const n = popTotal(unit.population)
    for (let i = 0; i < n; i++) {
      if (state.rng.next() >= TUNING.spawn.lunchTripP) {
        continue
      }
      const minute = LUNCH_START + randomInt(state.rng, LUNCH_END - LUNCH_START - LUNCH_DWELL_MIN)
      const tier = tierOfIndex(unit.population, i)
      const food = nearestAffordableFood(state, unit, tier)
      if (!food) {
        continue
      }
      schedulePending(state, minute, {
        tier,
        floor: unit.floor,
        x: unit.x,
        toFloor: food.floor,
        toX: food.x,
        purpose: 'lunch',
        tenantUnitId: unit.id,
        destUnitId: food.id,
        dwellMin: LUNCH_DWELL_MIN,
      })
    }
  }
}

/** Weekend 10:00 — roll each resident's errand (rng: accept + minute offset). */
function rollErrands(state: EngineState): void {
  const entrance = streetEntrance(state)
  if (!entrance) {
    return
  }
  for (const unit of unitsInIdOrder(state)) {
    if (itemDef(unit.kind).category !== 'residential' || !unit.occupied) {
      continue
    }
    const n = popTotal(unit.population)
    for (let i = 0; i < n; i++) {
      if (state.rng.next() >= TUNING.spawn.weekendErrandP) {
        continue
      }
      const minute = ERRAND_START + randomInt(state.rng, ERRAND_END - ERRAND_START)
      const tier = tierOfIndex(unit.population, i)
      schedulePending(state, minute, {
        tier,
        floor: unit.floor,
        x: unit.x,
        toFloor: entrance.floor,
        toX: entrance.x,
        purpose: 'errand',
        tenantUnitId: unit.id,
        destUnitId: null,
      })
      const returnMinute = minute + ERRAND_AWAY_MIN
      if (returnMinute < MINUTES_PER_DAY) {
        schedulePending(state, returnMinute, {
          tier,
          floor: entrance.floor,
          x: entrance.x,
          toFloor: unit.floor,
          toX: unit.x,
          purpose: 'errand',
          tenantUnitId: unit.id,
          destUnitId: unit.id,
        })
      }
    }
  }
}

/** Hourly 10:00–20:00 — exogenous shoppers (rng: tier, destination, dwell, source). */
function spawnShoppers(state: EngineState, weekend: boolean): void {
  const operating = operatingCommerce(state)
  if (operating.length === 0) {
    return
  }
  // Scale the crowd and the destination pool by commerce REACHABLE from the
  // street entrance — an unreachable shop shouldn't inflate the shopper count or
  // steal destination share from shops people can actually walk/ride to (those
  // phantom shoppers would just evaporate at spawn on a null route).
  const entrance = streetEntrance(state)
  const commerce = entrance
    ? operating.filter((u) => u.floor === entrance.floor || findRoute(state, entrance.floor, entrance.x, u.floor, u.x) !== null)
    : operating
  if (commerce.length === 0) {
    return
  }
  const base = (TUNING.spawn.shopperBasePerHour + state.star) * Math.pow(commerce.length, TUNING.spawn.shopperCommerceExponent)
  const count = Math.round(base * (weekend ? TUNING.spawn.weekendShopperFactor : 1))
  const tierEntries = (['low', 'med', 'high'] as const).map((tier) => ({
    value: tier as IncomeTier,
    weight: TUNING.people.visitorTierMix[tier],
  }))
  for (let i = 0; i < count; i++) {
    const tier = pickWeighted(state.rng, tierEntries)
    const affordable = commerce.filter((u) => affordsKindForShopper(tier, u.kind))
    if (affordable.length === 0) {
      continue
    }
    const dest = pickWeighted(
      state.rng,
      affordable.map((u) => ({ value: u, weight: itemDef(u.kind).capacity ?? 1 })),
    )
    const dwellMin = 20 + randomInt(state.rng, 21)
    let source = spawnSource(state)
    if (source && !isAnchorFloor(getMap(state.mapId), source.floor) && findRoute(state, source.floor, source.x, dest.floor, dest.x) === null) {
      source = streetEntrance(state) // subway not connected to the lobby yet
    }
    if (!source) {
      continue
    }
    spawnPerson(state, {
      tier,
      floor: source.floor,
      x: source.x,
      toFloor: dest.floor,
      toX: dest.x,
      purpose: 'shopping',
      destUnitId: dest.id,
      dwellMin,
    })
  }
}

function affordsKindForShopper(tier: IncomeTier, kind: ItemKind): boolean {
  if (kind === 'fastfood' || kind === 'foodCourt') {
    return true
  }
  if (kind === 'fancyRestaurant' || kind === 'spa') {
    return tier === 'high' || tier === 'vip'
  }
  return tier !== 'low'
}

// ── Commerce & amenity traffic (Phase 9) ────────────────────────────────────

/** Shared exogenous-visitor spawn: tier roll → affordable dest → source with route fallback. */
function spawnVisitor(state: EngineState, dest: Unit, tier: IncomeTier, purpose: 'shopping' | 'amenity', dwellMin: number): void {
  let source = spawnSource(state)
  if (source && !isAnchorFloor(getMap(state.mapId), source.floor) && findRoute(state, source.floor, source.x, dest.floor, dest.x) === null) {
    source = streetEntrance(state)
  }
  if (!source) {
    return
  }
  spawnPerson(state, {
    tier,
    floor: source.floor,
    x: source.x,
    toFloor: dest.floor,
    toX: dest.x,
    purpose,
    destUnitId: dest.id,
    dwellMin,
  })
}

/** Hourly 17:00–20:00 — evening diners (rng: tier, destination, source). */
function spawnDiners(state: EngineState): void {
  const restaurants = operatingCommerce(state).filter((u) => u.kind === 'restaurant' || u.kind === 'fancyRestaurant')
  if (restaurants.length === 0) {
    return
  }
  const count = Math.round(
    TUNING.commerce.eveningDinerBasePerHour * (1 + state.star) * Math.pow(restaurants.length, TUNING.spawn.shopperCommerceExponent),
  )
  const tierEntries = (['low', 'med', 'high'] as const).map((tier) => ({
    value: tier as IncomeTier,
    weight: TUNING.people.visitorTierMix[tier],
  }))
  for (let i = 0; i < count; i++) {
    const tier = pickWeighted(state.rng, tierEntries)
    const affordable = restaurants.filter((u) => affordsFood(tier, u.kind))
    if (affordable.length === 0) {
      continue // low-tier diners can't afford a sit-down dinner
    }
    const dest = pickWeighted(
      state.rng,
      affordable.map((u) => ({ value: u, weight: itemDef(u.kind).capacity ?? 1 })),
    )
    spawnVisitor(state, dest, tier, 'shopping', DINER_DWELL_MIN)
  }
}

/** Showtime crowds — batch split evenly across theaters, med+ tiers (rng: tier, source). */
function spawnTheaterCrowd(state: EngineState): void {
  const theaters = operatingCommerce(state).filter((u) => u.kind === 'movieTheater')
  if (theaters.length === 0) {
    return
  }
  const batch = TUNING.commerce.theaterBatchBase + TUNING.commerce.theaterBatchPerStar * state.star
  const tierEntries = (['med', 'high'] as const).map((tier) => ({
    value: tier as IncomeTier,
    weight: TUNING.people.visitorTierMix[tier],
  }))
  for (let i = 0; i < batch; i++) {
    const tier = pickWeighted(state.rng, tierEntries)
    spawnVisitor(state, theaters[i % theaters.length]!, tier, 'shopping', THEATER_DWELL_MIN)
  }
}

const AMENITY_ROLLS: Array<{ kind: ItemKind; p: number; minTier: 'med' | 'high' }> = [
  { kind: 'fitness', p: TUNING.commerce.fitnessDailyP, minTier: 'med' },
  { kind: 'pool', p: TUNING.commerce.poolDailyP, minTier: 'med' },
  { kind: 'spa', p: TUNING.commerce.spaDailyP, minTier: 'high' },
]

function affordsAmenity(tier: IncomeTier, minTier: 'med' | 'high'): boolean {
  if (minTier === 'high') {
    return tier === 'high' || tier === 'vip'
  }
  return tier !== 'low'
}

function nearestOfKind(state: EngineState, kind: ItemKind, from: Unit): Unit | null {
  let best: Unit | null = null
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity]
  for (const unit of operatingCommerce(state)) {
    if (unit.kind !== kind) {
      continue
    }
    const key: [number, number, number] = [Math.abs(unit.floor - from.floor), Math.abs(unit.x - from.x), unit.id]
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = unit
      bestKey = key
    }
  }
  return best
}

/**
 * 08:30 — plan today's tenant amenity visits (rng: per occupant, one roll per
 * gated-and-available amenity until the first hit, then the visit minute).
 * Residents visit in the evening window, hotel guests mid-morning; both reuse
 * the lunch-style dwell/return journey.
 */
function planAmenityVisits(state: EngineState): void {
  const available = AMENITY_ROLLS.filter(({ kind }) => operatingCommerce(state).some((u) => u.kind === kind))
  if (available.length === 0) {
    return
  }
  for (const unit of unitsInIdOrder(state)) {
    const category = itemDef(unit.kind).category
    const isResident = category === 'residential'
    const isGuestRoom = category === 'hotel' && (itemDef(unit.kind).income?.type ?? '') === 'perNight'
    if (!unit.occupied || (!isResident && !isGuestRoom)) {
      continue
    }
    const window = isResident ? RESIDENT_AMENITY : GUEST_AMENITY
    const n = popTotal(unit.population)
    for (let i = 0; i < n; i++) {
      const tier = tierOfIndex(unit.population, i)
      for (const roll of available) {
        if (!affordsAmenity(tier, roll.minTier)) {
          continue
        }
        if (state.rng.next() >= roll.p) {
          continue
        }
        const dest = nearestOfKind(state, roll.kind, unit)
        if (dest) {
          schedulePending(state, window.start + randomInt(state.rng, window.end - window.start), {
            tier,
            floor: unit.floor,
            x: unit.x,
            toFloor: dest.floor,
            toX: dest.x,
            purpose: 'amenity',
            tenantUnitId: unit.id,
            destUnitId: dest.id,
            dwellMin: AMENITY_DWELL_MIN,
          })
        }
        break // one amenity trip per occupant per day
      }
    }
  }
}

function operatingClinics(state: EngineState): Unit[] {
  return state.units.filter((u) => u.kind === 'medicalClinic' && u.occupied && !u.offline && !u.infested)
}

/** Nearest operating clinic whose copay-tier travel reach covers the patient's floor. */
function nearestClinicWithinReach(clinics: Unit[], from: Unit): Unit | null {
  let best: Unit | null = null
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity]
  for (const clinic of clinics) {
    const floorDist = Math.abs(clinic.floor - from.floor)
    if (floorDist > TUNING.clinic.copayReachFloors[clinic.rentTier]) {
      continue // higher copay ⇒ tighter reach ⇒ fewer patients travel to it
    }
    const key: [number, number, number] = [floorDist, Math.abs(clinic.x - from.x), clinic.id]
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = clinic
      bestKey = key
    }
  }
  return best
}

/**
 * 08:30 — plan today's clinic visits. Office workers (business hours) and
 * residents (evening) each roll a small per-occupant daily chance to visit the
 * nearest clinic within its copay-tier travel reach. Infrequent, and patients
 * travel farther than for gym/pool/spa amenities.
 */
function planClinicVisits(state: EngineState): void {
  const clinics = operatingClinics(state)
  if (clinics.length === 0) {
    return
  }
  for (const unit of unitsInIdOrder(state)) {
    if (!unit.occupied) {
      continue
    }
    const category = itemDef(unit.kind).category
    const isWorker = category === 'office'
    const isResident = category === 'residential'
    if (!isWorker && !isResident) {
      continue
    }
    // Offices are closed on weekends (like commute/lunch spawns), so workers
    // don't take clinic trips then; residents still visit on weekends.
    if (isWorker && isWeekend(state.clock.day)) {
      continue
    }
    const window = isWorker ? TUNING.clinic.workerWindow : TUNING.clinic.residentWindow
    // Workers can only leave for the clinic once arrivals finish, or a not-yet-
    // arrived worker would be spawned from an office they haven't reached.
    const windowStart = isWorker ? Math.max(window.start, OFFICE_ARRIVE.end) : window.start
    const dailyP = isWorker ? TUNING.clinic.workerDailyP : TUNING.clinic.residentDailyP
    const n = popTotal(unit.population)
    for (let i = 0; i < n; i++) {
      if (state.rng.next() >= dailyP) {
        continue
      }
      const dest = nearestClinicWithinReach(clinics, unit)
      if (!dest) {
        continue
      }
      schedulePending(state, windowStart + randomInt(state.rng, window.end - windowStart), {
        tier: tierOfIndex(unit.population, i),
        floor: unit.floor,
        x: unit.x,
        toFloor: dest.floor,
        toX: dest.x,
        purpose: 'amenity',
        tenantUnitId: unit.id,
        destUnitId: dest.id,
        dwellMin: TUNING.clinic.dwellMin,
      })
    }
  }
}

/** Weekday 09:00/13:00 — conference attendee batches (rng: tier, source). */
function spawnConferenceBatch(state: EngineState): void {
  const centers = operatingCommerce(state).filter((u) => u.kind === 'conferenceCenter')
  if (centers.length === 0) {
    return
  }
  const batch = Math.ceil((TUNING.commerce.conferenceAttendeesPerStar * state.star) / 2)
  const tierEntries = (['med', 'high'] as const).map((tier) => ({
    value: tier as IncomeTier,
    weight: TUNING.people.visitorTierMix[tier],
  }))
  for (let i = 0; i < batch; i++) {
    const tier = pickWeighted(state.rng, tierEntries)
    spawnVisitor(state, centers[i % centers.length]!, tier, 'shopping', CONFERENCE_DWELL_MIN)
  }
}

/** Weekend 18:00 — one event per event space: income posts up front, VIP-ish crowd flows in. */
function runWeekendEvents(state: EngineState, events: EngineEvent[]): void {
  const spaces = operatingCommerce(state).filter((u) => u.kind === 'eventSpace')
  for (const space of spaces) {
    postImmediate(state, 'events.income', TUNING.commerce.eventIncome, events)
    for (let i = 0; i < TUNING.commerce.eventVisitors; i++) {
      spawnVisitor(state, space, 'high', 'amenity', EVENT_DWELL_MIN)
    }
  }
}

function drainPending(state: EngineState, minute: number): void {
  const aux = getAux(state)
  const list = aux.pending.get(minute)
  if (!list) {
    return
  }
  aux.pending.delete(minute)
  for (const spawn of list) {
    spawnPerson(state, spawn)
  }
}

function minuteTick(state: EngineState, minute: number, events: EngineEvent[]): void {
  const weekend = isWeekend(state.clock.day)
  drainPending(state, minute)
  stepHotelMinute(state, minute)
  stepVipMinute(state, minute, events)
  stepIncidentMinute(state, minute, events)
  if (minute === INCIDENT_CHECK_MINUTE) {
    stepIncidents(state, weekend, events)
  }
  if (minute === REQUEST_GENERATION_MINUTE && ((state.clock.day - 1) % 7) + 1 === 1) {
    generateRequest(state, events) // Mondays only
  }
  if (minute === 0) {
    generateDailyTrash(state) // midnight trash generation (see economy.ts note)
  }
  if (minute === TRASH_HAUL_MINUTE) {
    haulTrash(state)
  }
  if (minute === STALL_RESET_MINUTE) {
    clearAllStalls(state)
  }
  if (!weekend) {
    if (
      (minute >= OFFICE_ARRIVE.start && minute < OFFICE_ARRIVE.end) ||
      (minute >= OFFICE_DEPART.start && minute < OFFICE_DEPART.end)
    ) {
      officeCommutes(state, minute)
    }
    if (
      (minute >= RESIDENT_DEPART.start && minute < RESIDENT_DEPART.end) ||
      (minute >= RESIDENT_RETURN.start && minute < RESIDENT_RETURN.end)
    ) {
      residentCommutes(state, minute)
    }
    if (minute === LUNCH_START) {
      rollLunchTrips(state)
    }
  } else if (minute === ERRAND_START) {
    rollErrands(state)
  }
  if (minute === AMENITY_PLAN_MINUTE) {
    planAmenityVisits(state)
    planClinicVisits(state)
  }
  if (!weekend && CONFERENCE_MINUTES.includes(minute)) {
    spawnConferenceBatch(state)
  }
  if (
    (TUNING.commerce.theaterShowtimeMinutes as readonly number[]).includes(minute) ||
    (weekend && minute === TUNING.commerce.weekendMatineeMinute)
  ) {
    spawnTheaterCrowd(state)
  }
  if (weekend && minute === TUNING.commerce.eventMinute) {
    runWeekendEvents(state, events)
  }
  if (minute % 60 === 0) {
    const hour = minute / 60
    if (hour >= SHOPPER_FIRST_HOUR && hour <= SHOPPER_LAST_HOUR) {
      spawnShoppers(state, weekend)
    }
  }
  // Diners spawn on the half-hour so the dinner wave staggers off the shopper wave.
  if (minute % 60 === 30) {
    const hour = (minute - 30) / 60
    if (hour >= DINER_FIRST_HOUR && hour <= DINER_LAST_HOUR) {
      spawnDiners(state)
    }
  }
}

/**
 * Process every integer minute in (prevMinute, newMinute]. A negative or
 * larger prevMinute means the window wrapped midnight — defensively at most
 * one day of minutes is processed.
 */
export function stepSchedules(state: EngineState, prevMinute: number, newMinute: number, events: EngineEvent[]): void {
  let prev = prevMinute
  if (prev > newMinute) {
    prev -= MINUTES_PER_DAY
  }
  prev = Math.max(prev, newMinute - MINUTES_PER_DAY)
  for (let m = Math.floor(prev) + 1; m <= Math.floor(newMinute); m++) {
    const minuteOfDay = ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    minuteTick(state, minuteOfDay, events)
  }
}
