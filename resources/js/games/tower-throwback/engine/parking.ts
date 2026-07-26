/**
 * Parking — ramp-served basement floors, stall assignment for car commuters,
 * and the office shortfall penalty.
 *
 * A basement floor is ramp-served when parkingRamp units exist on EVERY floor
 * from −1 down to it (surface access assumed at the −1 ramp head). Stalls on
 * unserved floors are nonfunctional (flags.noRoute, occupied=false). Demand =
 * suites × spacesPerSuite + floor(occupiedOffices / officesPerSpace); the
 * med/high car-commuter share emerges from first-come stall filling in id
 * order (stalls run out exactly when share < 1). A parked car is the stall's
 * population (tenancy-style marker, cleared when the owner drives off or at
 * the 03:00 safety reset). Stall↔office links live in a WeakMap included in
 * deterministic save snapshots; the 03:00 reset still self-heals any journey
 * that never completed.
 *
 * The −5 office eval penalty (TUNING.parking.shortfallOfficeEvalPenalty)
 * applies only once the parking item class is unlocked (maxStarReached ≥ 3) —
 * same reasoning as trash: no penalty for a mechanic the player cannot yet
 * build for. Spec updated to match.
 */

import type { EngineState, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef } from './catalog'

interface ParkingAux {
  /** officeUnitId → stall ids whose cars belong to that office today. */
  stallsByOffice: Map<number, number[]>
}

export interface ParkingRuntimeSnapshot {
  stallsByOffice: Array<[number, number[]]>
}

const auxMap = new WeakMap<EngineState, ParkingAux>()

function getAux(state: EngineState): ParkingAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { stallsByOffice: new Map() }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotParkingRuntime(state: EngineState): ParkingRuntimeSnapshot {
  return {
    stallsByOffice: [...getAux(state).stallsByOffice.entries()].map(([officeId, stallIds]) => [officeId, [...stallIds]]),
  }
}

export function restoreParkingRuntime(state: EngineState, snapshot: ParkingRuntimeSnapshot): void {
  auxMap.set(state, {
    stallsByOffice: new Map(snapshot.stallsByOffice.map(([officeId, stallIds]) => [officeId, [...stallIds]])),
  })
}

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

/** Basement floors reachable through a contiguous ramp chain from −1. */
export function rampServedFloors(state: EngineState): Set<number> {
  const rampFloors = new Set(state.units.filter((u) => u.kind === 'parkingRamp').map((u) => u.floor))
  const served = new Set<number>()
  for (let floor = -1; rampFloors.has(floor); floor--) {
    served.add(floor)
  }
  return served
}

export function functionalStalls(state: EngineState): Unit[] {
  const served = rampServedFloors(state)
  return unitsInIdOrder(state).filter((u) => u.kind === 'parkingSpace' && served.has(u.floor) && !u.offline)
}

export function parkingDemand(state: EngineState): number {
  let suites = 0
  let offices = 0
  for (const unit of state.units) {
    if (unit.kind === 'hotelSuite') {
      suites += 1
    } else if (itemDef(unit.kind).category === 'office' && unit.occupied) {
      offices += 1
    }
  }
  return suites * TUNING.parking.spacesPerSuite + Math.floor(offices / TUNING.parking.officesPerSpace)
}

/** True while demand outstrips functional stalls (gated on the 3★ unlock). */
export function parkingShortfall(state: EngineState): boolean {
  if (state.maxStarReached < 3) {
    return false
  }
  const demand = parkingDemand(state)
  return demand > 0 && functionalStalls(state).length < demand
}

/** occupancyPass hook: nonfunctional stalls are flagged unroutable. */
export function refreshParkingFlags(state: EngineState, unit: Unit): void {
  if (unit.kind !== 'parkingSpace') {
    return
  }
  const served = rampServedFloors(state)
  const functional = served.has(unit.floor) && !unit.offline
  unit.flags.noRoute = !functional
  if (!functional) {
    unit.population = { low: 0, med: 0, high: 0, vip: 0 }
    unit.occupied = false
  }
}

/**
 * Claim the first free functional stall for an arriving car commuter.
 * Returns the stall (population marks the parked car) or null when full.
 */
export function claimStall(state: EngineState, officeId: number, tier: 'med' | 'high'): Unit | null {
  const stall = functionalStalls(state).find((s) => {
    const pop = s.population
    return pop.low + pop.med + pop.high + pop.vip === 0
  })
  if (!stall) {
    return null
  }
  stall.population[tier] += 1
  stall.occupied = true
  const aux = getAux(state)
  const list = aux.stallsByOffice.get(officeId)
  if (list) {
    list.push(stall.id)
  } else {
    aux.stallsByOffice.set(officeId, [stall.id])
  }
  return stall
}

/** Undo a claim whose commute journey could not be routed. */
export function releaseStall(state: EngineState, officeId: number, stallId: number): void {
  const stall = state.units.find((u) => u.id === stallId)
  if (stall) {
    stall.population = { low: 0, med: 0, high: 0, vip: 0 }
    stall.occupied = false
  }
  const list = getAux(state).stallsByOffice.get(officeId)
  if (list) {
    const index = list.indexOf(stallId)
    if (index >= 0) {
      list.splice(index, 1)
    }
  }
}

/** Evening: hand the next parked stall back to a departing worker of this office. */
export function takeParkedStall(state: EngineState, officeId: number): Unit | null {
  const aux = getAux(state)
  const list = aux.stallsByOffice.get(officeId)
  if (!list || list.length === 0) {
    return null
  }
  const stallId = list.shift()!
  if (list.length === 0) {
    aux.stallsByOffice.delete(officeId)
  }
  return state.units.find((u) => u.id === stallId) ?? null
}

/** 03:00 safety reset — overnight the garage always empties. */
export function clearAllStalls(state: EngineState): void {
  for (const unit of state.units) {
    if (unit.kind === 'parkingSpace') {
      unit.population = { low: 0, med: 0, high: 0, vip: 0 }
      unit.occupied = false
    }
  }
  getAux(state).stallsByOffice.clear()
}
