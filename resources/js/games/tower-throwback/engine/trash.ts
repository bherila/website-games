/**
 * Trash chain — nightly generation into the nearest trash room, the 04:00
 * haul that empties rooms, and overflow flagging.
 *
 * Model (normative, mirrored in the spec's "Hotel & trash constants" table):
 * every occupied unit generates populationSum × perOccupantPerDay trash at
 * midnight into its NEAREST trash room (by |Δfloor|, then tile gap, then id).
 * A recycling-grade room, or any recycling center in the tower, halves the
 * accumulated load (recyclingHaulFactor). Rooms empty daily at 04:00 with
 * haulersPerTrashRoom visible staff journeys (service shafts; to the recycling
 * center when one exists, otherwise to the street). A room whose load exceeds
 * trashRoomCapacity sets ITS OWN flags.trashOverflow — the eval formula
 * penalizes every unit within trashRadiusTiles of a flagged unit on the same
 * floor, so flagging the room alone yields exactly the intended 16-tile
 * penalty zone (flagging the neighbourhood would double the radius). With no
 * trash room in the tower there is no overflow mechanic — the item class
 * unlocks at 3★.
 *
 * The room-load ledger lives in a WeakMap and is included in deterministic
 * save snapshots so a mid-haul reload cannot change overflow outcomes.
 */

import type { EngineState, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { spawnPerson, streetEntrance } from './people'

export const TRASH_HAUL_MINUTE = 4 * 60

const loadMap = new WeakMap<EngineState, Map<number, number>>()

export interface TrashRuntimeSnapshot {
  loads: Array<[number, number]>
}

function getLoads(state: EngineState): Map<number, number> {
  let loads = loadMap.get(state)
  if (!loads) {
    loads = new Map()
    loadMap.set(state, loads)
  }
  return loads
}

export function snapshotTrashRuntime(state: EngineState): TrashRuntimeSnapshot {
  const liveUnitIds = new Set(state.units.map((unit) => unit.id))
  return {
    loads: [...getLoads(state).entries()].filter(([roomId, load]) => liveUnitIds.has(roomId) && load !== 0),
  }
}

export function restoreTrashRuntime(state: EngineState, snapshot: TrashRuntimeSnapshot): void {
  loadMap.set(state, new Map(snapshot.loads))
}

/** Current stored load of a trash room (exported for tests/HUD). */
export function trashLoad(state: EngineState, roomId: number): number {
  return getLoads(state).get(roomId) ?? 0
}

function trashRooms(state: EngineState): Unit[] {
  return state.units.filter((u) => u.kind === 'trashRoom' && !u.offline)
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

function nearestRoom(rooms: Unit[], unit: Unit): Unit {
  let best = rooms[0]!
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity]
  for (const room of rooms) {
    const key: [number, number, number] = [
      Math.abs(room.floor - unit.floor),
      tileGap(unit.x, unit.width, room.x, room.width),
      room.id,
    ]
    if (
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
    ) {
      best = room
      bestKey = key
    }
  }
  return best
}

/**
 * Midnight hook (schedules' minute-0 tick): accumulate the day's trash and
 * flag rooms pushed past capacity.
 */
export function generateDailyTrash(state: EngineState): void {
  const rooms = trashRooms(state)
  if (rooms.length === 0) {
    return
  }
  const loads = getLoads(state)
  const recyclingCenter = state.units.some((u) => u.kind === 'recyclingCenter' && !u.offline)
  for (const unit of state.units) {
    if (!unit.occupied || unit.kind === 'parkingSpace') {
      continue
    }
    const pop = unit.population
    const trash = (pop.low + pop.med + pop.high + pop.vip) * TUNING.trash.perOccupantPerDay
    if (trash === 0) {
      continue
    }
    const room = nearestRoom(rooms, unit)
    const factor = room.grade === 'recycling' || recyclingCenter ? TUNING.trash.recyclingHaulFactor : 1
    loads.set(room.id, (loads.get(room.id) ?? 0) + trash * factor)
  }
  for (const room of rooms) {
    if ((loads.get(room.id) ?? 0) > TUNING.trash.trashRoomCapacity) {
      room.flags.trashOverflow = true
    }
  }
}

/** 04:00 hook (schedules): empty every room, clear overflow, spawn haul journeys. */
export function haulTrash(state: EngineState): void {
  const loads = getLoads(state)
  const destinationUnit = state.units.find((u) => u.kind === 'recyclingCenter' && !u.offline)
  const street = streetEntrance(state)
  for (const room of trashRooms(state)) {
    const hadLoad = (loads.get(room.id) ?? 0) > 0 || room.flags.trashOverflow
    loads.set(room.id, 0)
    room.flags.trashOverflow = false
    if (!hadLoad) {
      continue
    }
    const target = destinationUnit
      ? { floor: destinationUnit.floor, x: destinationUnit.x, destUnitId: destinationUnit.id }
      : street
        ? { floor: street.floor, x: street.x, destUnitId: null }
        : null
    if (!target) {
      continue
    }
    for (let i = 0; i < TUNING.trash.haulersPerTrashRoom; i++) {
      spawnPerson(state, {
        tier: 'low',
        floor: room.floor,
        x: room.x,
        toFloor: target.floor,
        toX: target.x,
        purpose: 'trashHaul',
        staff: true,
        tenantUnitId: room.id,
        destUnitId: target.destUnitId,
      })
    }
  }
}
