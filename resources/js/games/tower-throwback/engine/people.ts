/**
 * People — spawn/despawn, the walking/queued/riding state machine, patience,
 * pass-by sales, and journey completion.
 *
 * Tenancy counter handshake: `unit.population` is TENANCY and never changes
 * from journeys — spawning a commuter neither decrements nor increments it;
 * in-flight people reference their unit via `tenantUnitId` only. Per-visit
 * income posts once, on first arrival at the destination unit.
 *
 * Ownership split with elevators.ts: this module advances walk/stairs/escalator
 * legs and counts down queue patience; elevators.ts owns queued→riding→alight
 * transitions (alight advances `legIndex` and sets 'walking').
 *
 * Auxiliary state (dwell timers, return plans, LOD overflow queue) lives in a
 * per-EngineState WeakMap and is included in deterministic save snapshots.
 *
 * rng consumption (deterministic, id order): pass-by purchase rolls only.
 */

import currency from 'currency.js'

import type { EngineEvent, EngineState, IncomeTier, JourneyLeg, JourneyPurpose, Person, Shaft, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef } from './catalog'
import { postImmediate } from './economy'
import { getSegments, slabAt } from './grid'
import { getMap } from './maps'
import { findRoute } from './routing'

/** Street entrance: left edge of the first ground-floor segment (shared spawn point). */
export function streetEntrance(state: EngineState): { floor: number; x: number } | null {
  const lobbyFloor = getMap(state.mapId).lobbyAnchorFloor
  const seg = getSegments(state).get(lobbyFloor)?.[0]
  return seg ? { floor: lobbyFloor, x: seg.x0 } : null
}

export interface SpawnOpts {
  tier: IncomeTier
  vip?: boolean
  floor: number
  x: number
  toFloor: number
  toX: number
  purpose: JourneyPurpose
  tenantUnitId?: number | null
  destUnitId?: number | null
  staff?: boolean
  /** Dwell at the destination this many game-minutes, then return to the origin and despawn. */
  dwellMin?: number
}

export interface PersonPlan {
  staff: boolean
  dwellMin: number | null
  returnTo: { floor: number; x: number } | null
}

interface PeopleAux {
  overflow: SpawnOpts[]
  plans: Map<number, PersonPlan>
  dwell: Map<number, number>
  /** Real game-minutes spent queued (per person) — the congestion stat's source. */
  queuedMin: Map<number, number>
}

export interface PeopleRuntimeSnapshot {
  overflow: SpawnOpts[]
  plans: Array<[number, PersonPlan]>
  dwell: Array<[number, number]>
  queuedMin: Array<[number, number]>
}

const auxMap = new WeakMap<EngineState, PeopleAux>()

function getAux(state: EngineState): PeopleAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { overflow: [], plans: new Map(), dwell: new Map(), queuedMin: new Map() }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotPeopleRuntime(state: EngineState): PeopleRuntimeSnapshot {
  const aux = getAux(state)
  return {
    overflow: aux.overflow.map((spawn) => ({ ...spawn })),
    plans: [...aux.plans.entries()].map(([personId, plan]) => [
      personId,
      { ...plan, returnTo: plan.returnTo ? { ...plan.returnTo } : null },
    ]),
    dwell: [...aux.dwell.entries()],
    queuedMin: [...aux.queuedMin.entries()],
  }
}

export function restorePeopleRuntime(state: EngineState, snapshot: PeopleRuntimeSnapshot): void {
  auxMap.set(state, {
    overflow: snapshot.overflow.map((spawn) => ({ ...spawn })),
    plans: new Map(snapshot.plans.map(([personId, plan]) => [
      personId,
      { ...plan, returnTo: plan.returnTo ? { ...plan.returnTo } : null },
    ])),
    dwell: new Map(snapshot.dwell),
    queuedMin: new Map(snapshot.queuedMin),
  })
}

function findUnit(state: EngineState, id: number | null | undefined): Unit | undefined {
  if (id === null || id === undefined) {
    return undefined
  }
  return state.units.find((u) => u.id === id)
}

/**
 * Read-and-reset the person's ACTUAL queued minutes (for the boarding-time
 * congestion sample). Patience-based estimates over-counted: the left-behind
 * ×0.75 patience chop looked like waiting time and inflated the EMA.
 */
export function consumeQueuedMinutes(state: EngineState, personId: number): number {
  const aux = getAux(state)
  const waited = aux.queuedMin.get(personId) ?? 0
  aux.queuedMin.delete(personId)
  return waited
}

/** Queue patience budget: tier base × tenant rent tolerance. */
export function initialPatienceOf(state: EngineState, person: Person): number {
  const base = TUNING.people.patienceByTier[person.tier]
  const tenantUnit = findUnit(state, person.tenantUnitId)
  return tenantUnit ? base * TUNING.rent.toleranceMultiplier[tenantUnit.rentTier] : base
}

function stateForLeg(leg: JourneyLeg | undefined): Person['state'] {
  return leg?.type === 'elevator' ? 'queued' : 'walking'
}

/**
 * Spawn a person on a routed journey. Returns null (and spawns nothing) when
 * no route exists or the journey is zero-length; defers to the overflow FIFO
 * when the active-population LOD cap is reached.
 */
export function spawnPerson(state: EngineState, opts: SpawnOpts): Person | null {
  if (state.people.length >= TUNING.people.maxActive) {
    getAux(state).overflow.push(opts)
    return null
  }
  const legs = findRoute(state, opts.floor, opts.x, opts.toFloor, opts.toX, { staff: opts.staff === true })
  if (legs === null || legs.length === 0) {
    return null
  }
  const person: Person = {
    id: state.nextId,
    tier: opts.tier,
    vip: opts.vip === true,
    state: stateForLeg(legs[0]),
    floor: opts.floor,
    x: opts.x,
    patienceLeft: 0,
    irritated: false,
    legs,
    legIndex: 0,
    purpose: opts.purpose,
    tenantUnitId: opts.tenantUnitId ?? null,
    destUnitId: opts.destUnitId ?? null,
  }
  state.nextId += 1
  person.patienceLeft = initialPatienceOf(state, person)
  state.people.push(person)
  getAux(state).plans.set(person.id, {
    staff: opts.staff === true,
    dwellMin: opts.dwellMin ?? null,
    returnTo: opts.dwellMin !== undefined ? { floor: opts.floor, x: opts.x } : null,
  })
  return person
}

export function despawnPerson(state: EngineState, id: number): void {
  const index = state.people.findIndex((p) => p.id === id)
  if (index >= 0) {
    state.people.splice(index, 1)
  }
  const aux = getAux(state)
  aux.plans.delete(id)
  aux.dwell.delete(id)
  aux.queuedMin.delete(id)
}

// ── Shaft-demolition rescue ──────────────────────────────────────────────────

function replanJourney(state: EngineState, person: Person): void {
  const final = person.legs[person.legs.length - 1]
  const plan = getAux(state).plans.get(person.id)
  if (!final) {
    despawnPerson(state, person.id)
    return
  }
  const legs = findRoute(state, person.floor, person.x, final.toFloor, final.toX, { staff: plan?.staff === true })
  if (legs === null) {
    despawnPerson(state, person.id) // no route left — abandon, like a patience expiry
    return
  }
  person.legs = legs
  person.legIndex = 0
  person.state = stateForLeg(legs[0]) // zero-leg routes complete on the next people tick
  person.patienceLeft = initialPatienceOf(state, person)
}

/**
 * Called by placement.applyDemolish AFTER a shaft is removed and the grid
 * rebuilt: riders are set down at the car's nearest slabbed floor and everyone
 * whose remaining journey referenced the shaft re-plans from where they stand
 * (unroutable → despawn). Without this, 'riding' people were skipped forever
 * and leaked toward the LOD cap.
 */
export function releaseShaftOccupants(state: EngineState, shaft: Shaft): void {
  const clampFloor = (y: number): number => {
    const rounded = Math.max(shaft.bottomFloor, Math.min(shaft.topFloor, Math.round(y)))
    for (let delta = 0; delta <= shaft.topFloor - shaft.bottomFloor; delta++) {
      for (const candidate of [rounded - delta, rounded + delta]) {
        if (candidate >= shaft.bottomFloor && candidate <= shaft.topFloor && slabAt(state, candidate, shaft.x)) {
          return candidate
        }
      }
    }
    return rounded
  }
  for (const car of shaft.cars) {
    for (const id of car.passengerIds) {
      const person = state.people.find((p) => p.id === id)
      if (!person) {
        continue
      }
      person.floor = clampFloor(car.y)
      person.x = shaft.x
      person.state = 'walking'
    }
    car.passengerIds = []
  }
  for (const person of [...state.people]) {
    if (person.state === 'riding') {
      continue // riders of OTHER shafts are untouched
    }
    const affected = person.legs
      .slice(person.legIndex)
      .some((leg) => leg.type === 'elevator' && leg.shaftId === shaft.id)
    if (affected) {
      replanJourney(state, person)
    }
  }
}

/** Re-plan only journeys invalidated by removed landings after a shaft contraction. */
export function replanShaftAfterResize(state: EngineState, shaft: Shaft, removedStops: readonly number[]): void {
  if (removedStops.length === 0) {
    return
  }
  const removed = new Set(removedStops)
  const affectedLeg = (person: Person): boolean =>
    person.legs.slice(person.legIndex).some(
      (leg) =>
        leg.type === 'elevator' &&
        leg.shaftId === shaft.id &&
        (removed.has(leg.fromFloor) || removed.has(leg.toFloor)),
    )
  const nearestEnabledStop = (carY: number): number =>
    shaft.enabledStops.reduce((nearest, floor) => {
      const distance = Math.abs(floor - carY)
      const nearestDistance = Math.abs(nearest - carY)
      return distance < nearestDistance || (distance === nearestDistance && floor < nearest) ? floor : nearest
    })

  for (const car of shaft.cars) {
    const remainingPassengers: number[] = []
    for (const id of car.passengerIds) {
      const person = state.people.find((candidate) => candidate.id === id)
      if (!person || !affectedLeg(person)) {
        remainingPassengers.push(id)
        continue
      }
      person.floor = nearestEnabledStop(car.y)
      person.x = shaft.x
      person.state = 'walking'
      replanJourney(state, person)
    }
    car.passengerIds = remainingPassengers
  }

  for (const person of [...state.people]) {
    if (!affectedLeg(person)) {
      continue
    }
    if (person.state !== 'riding') {
      replanJourney(state, person)
      continue
    }
    // Still riding → a passenger of ANOTHER shaft (this shaft's own affected
    // passengers were set down above). Splice a fresh tail after the in-flight
    // leg so they are not carried toward a landing that no longer exists.
    const current = person.legs[person.legIndex]
    if (current?.type !== 'elevator') {
      continue
    }
    const final = person.legs[person.legs.length - 1]!
    const plan = getAux(state).plans.get(person.id)
    const tail = findRoute(state, current.toFloor, current.toX, final.toFloor, final.toX, { staff: plan?.staff === true })
    if (tail === null) {
      despawnPerson(state, person.id) // no route left from the alight point — abandon, like a patience expiry
      continue
    }
    person.legs = [...person.legs.slice(0, person.legIndex + 1), ...tail]
  }
}

// ── Journey completion ───────────────────────────────────────────────────────

const VISIT_PURPOSES: ReadonlySet<JourneyPurpose> = new Set<JourneyPurpose>(['lunch', 'errand', 'shopping', 'amenity'])

function postVisitIncome(state: EngineState, person: Person, events: EngineEvent[]): void {
  if (!VISIT_PURPOSES.has(person.purpose)) {
    return
  }
  const unit = findUnit(state, person.destUnitId)
  if (!unit || !unit.occupied || unit.offline || unit.infested) {
    return
  }
  const income = itemDef(unit.kind).income
  if (income?.type !== 'perVisit') {
    return
  }
  if (unit.kind === 'medicalClinic') {
    // Copay scales with the clinic's player-set tier (reused rentTier). currency.js
    // per the money-math rule so configurable multipliers can't drift (AGENTS.md #6).
    const copay = currency(income.amount).multiply(TUNING.clinic.copayMultiplier[unit.rentTier]).value
    postImmediate(state, 'sales.medical', copay, events)
    return
  }
  const line = person.purpose === 'amenity' ? 'sales.amenity' : 'sales.commerce'
  postImmediate(state, line, income.amount, events)
}

/**
 * Tenancy-changing arrivals — the documented exceptions to the "population
 * never changes from journeys" rule: a hotel check-in ESTABLISHES tenancy
 * (checkout clears it at journey spawn in hotel.ts), and a car commuter
 * reaching their stall at day's end drives off (stall marker cleared).
 */
function applyArrivalEffects(state: EngineState, person: Person): void {
  const unit = findUnit(state, person.destUnitId)
  if (!unit) {
    return
  }
  if (person.purpose === 'hotelCheckIn' && !unit.occupied) {
    unit.occupied = true
    unit.vacancyReason = null
    unit.dirty = false
    unit.population[person.tier] += itemDef(unit.kind).capacity ?? 1
    return
  }
  if (person.purpose === 'commuteOut' && unit.kind === 'parkingSpace') {
    unit.population = { low: 0, med: 0, high: 0, vip: 0 }
    unit.occupied = false
  }
}

function completeJourney(state: EngineState, person: Person, events: EngineEvent[]): void {
  const aux = getAux(state)
  const plan = aux.plans.get(person.id)
  applyArrivalEffects(state, person)
  if (plan && plan.dwellMin !== null) {
    postVisitIncome(state, person, events)
    aux.dwell.set(person.id, plan.dwellMin)
    plan.dwellMin = null
    return
  }
  despawnPerson(state, person.id)
}

function startReturnJourney(state: EngineState, person: Person, returnTo: { floor: number; x: number }): void {
  const plan = getAux(state).plans.get(person.id)
  const legs = findRoute(state, person.floor, person.x, returnTo.floor, returnTo.x, { staff: plan?.staff === true })
  if (legs === null || legs.length === 0) {
    despawnPerson(state, person.id)
    return
  }
  person.legs = legs
  person.legIndex = 0
  person.destUnitId = null
  person.state = stateForLeg(legs[0])
  person.patienceLeft = initialPatienceOf(state, person)
}

// ── Pass-by sales ────────────────────────────────────────────────────────────

function affordsKind(tier: IncomeTier, kind: Unit['kind']): boolean {
  if (kind === 'fastfood' || kind === 'foodCourt') {
    return true
  }
  if (kind === 'shop' || kind === 'restaurant' || kind === 'movieTheater' || kind === 'fitness') {
    return tier !== 'low'
  }
  if (kind === 'fancyRestaurant' || kind === 'spa') {
    return tier === 'high' || tier === 'vip'
  }
  return true
}

/** Impulse purchases while walking past shops/fastfood — the only rng consumer here. */
function passBySales(state: EngineState, person: Person, leg: JourneyLeg, events: EngineEvent[]): void {
  const lo = Math.min(leg.fromX, leg.toX)
  const hi = Math.max(leg.fromX, leg.toX)
  for (const unit of state.units) {
    if (unit.kind !== 'shop' && unit.kind !== 'fastfood') {
      continue
    }
    if (unit.floor !== leg.fromFloor || unit.id === person.destUnitId) {
      continue
    }
    if (unit.x + unit.width - 1 < lo || unit.x > hi) {
      continue
    }
    if (!unit.occupied || unit.offline || unit.infested || !affordsKind(person.tier, unit.kind)) {
      continue
    }
    const p = unit.kind === 'shop' ? TUNING.economy.passByShopP : TUNING.economy.passByFastFoodP
    if (state.rng.next() < p) {
      const income = itemDef(unit.kind).income
      if (income?.type === 'perVisit') {
        postImmediate(state, 'sales.commerce', income.amount * TUNING.economy.passByIncomeFactor, events)
      }
    }
  }
}

// ── Patience ─────────────────────────────────────────────────────────────────

function onPatienceExpired(state: EngineState, person: Person): void {
  const tenantUnit = findUnit(state, person.tenantUnitId)
  if (tenantUnit) {
    tenantUnit.stressMarks += 1
  }
  const leg = person.legs[person.legIndex]
  if (!person.irritated && leg?.type === 'elevator' && leg.shaftId !== undefined) {
    person.irritated = true
    const final = person.legs[person.legs.length - 1]!
    const plan = getAux(state).plans.get(person.id)
    const alt = findRoute(state, person.floor, person.x, final.toFloor, final.toX, {
      staff: plan?.staff === true,
      avoidShaftId: leg.shaftId,
    })
    if (alt !== null && alt.length > 0) {
      person.legs = alt
      person.legIndex = 0
      person.state = stateForLeg(alt[0])
      person.patienceLeft = initialPatienceOf(state, person) * TUNING.people.reboardPatienceFactor
      return
    }
  }
  despawnPerson(state, person.id)
}

// ── Step ─────────────────────────────────────────────────────────────────────

function enterLeg(person: Person): void {
  const leg = person.legs[person.legIndex]
  person.state = stateForLeg(leg)
  if (leg?.type === 'elevator') {
    person.x = leg.fromX
    person.floor = leg.fromFloor
  }
}

function advanceMovement(state: EngineState, person: Person, dtGameMin: number, events: EngineEvent[]): void {
  let t = dtGameMin
  let guard = 0
  while (t > 1e-9) {
    if (++guard > 100) {
      break
    }
    const leg = person.legs[person.legIndex]
    if (!leg) {
      completeJourney(state, person, events)
      return
    }
    if (leg.type === 'elevator') {
      person.state = 'queued'
      return
    }
    if (leg.type === 'walk' || leg.type === 'skybridge') {
      const speed = TUNING.movement.walkTilesPerGameMin
      const remaining = Math.abs(leg.toX - person.x)
      const need = remaining / speed
      if (need > t) {
        person.x += Math.sign(leg.toX - person.x) * speed * t
        return
      }
      person.x = leg.toX
      person.floor = leg.toFloor
      t -= need
      person.legIndex += 1
      passBySales(state, person, leg, events)
      enterLeg(person)
      continue
    }
    const speed = leg.type === 'stairs' ? TUNING.movement.stairsFloorsPerGameMin : TUNING.movement.escalatorFloorsPerGameMin
    const remaining = Math.abs(leg.toFloor - person.floor)
    const need = remaining / speed
    if (need > t) {
      person.floor += Math.sign(leg.toFloor - person.floor) * speed * t
      return
    }
    person.floor = leg.toFloor
    person.x = leg.toX
    t -= need
    person.legIndex += 1
    enterLeg(person)
  }
}

/** 8 Hz person tick (the engine gates the cadence). Iterates in id order. */
export function stepPeople(state: EngineState, dtGameMin: number, events: EngineEvent[]): void {
  const aux = getAux(state)
  while (aux.overflow.length > 0 && state.people.length < TUNING.people.maxActive) {
    spawnPerson(state, aux.overflow.shift()!)
  }

  // A COPY (not a sort — array order is id order) so self-despawns during the
  // loop can splice state.people safely.
  for (const person of [...state.people]) {
    if (person.state === 'riding') {
      continue
    }
    const dwellLeft = aux.dwell.get(person.id)
    if (dwellLeft !== undefined) {
      const left = dwellLeft - dtGameMin
      if (left > 0) {
        aux.dwell.set(person.id, left)
      } else {
        aux.dwell.delete(person.id)
        if (person.purpose === 'housekeeping') {
          const room = findUnit(state, person.destUnitId)
          if (room) {
            room.dirty = false
            room.vacancyReason = null
          }
        }
        const plan = aux.plans.get(person.id)
        if (plan?.returnTo) {
          startReturnJourney(state, person, plan.returnTo)
        } else {
          despawnPerson(state, person.id)
        }
      }
      continue
    }
    if (person.state === 'queued') {
      person.patienceLeft -= dtGameMin
      aux.queuedMin.set(person.id, (aux.queuedMin.get(person.id) ?? 0) + dtGameMin)
      if (person.patienceLeft <= 0) {
        onPatienceExpired(state, person)
      }
      continue
    }
    advanceMovement(state, person, dtGameMin, events)
  }
}
