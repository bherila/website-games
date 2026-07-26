/**
 * Hotel loop — nightly guests, checkout, and housekeeping dispatch.
 *
 * Rooms operate only while a hotelReception exists (flags.noReception
 * otherwise). At 18:00 the night is planned: demand = totalRooms ×
 * min(hotelOccMax, hotelOccBase + hotelOccPerStar×star +
 * hotelOccEvalFactor×avgHotelEval/100); check-ins spread 18:00–22:00 over the
 * first available clean vacant rooms in id order. Check-in is a TENANCY event
 * (the documented exception to the never-from-journeys population rule):
 * arrival sets `occupied` and fills `population` with the room's capacity;
 * checkout (07:00–09:00) clears both at journey spawn and marks the room
 * dirty. Occupied rooms bill perNight × rent multiplier × luxury factor at
 * midnight (economy.settleMidnight → 'hotel.nights').
 *
 * Housekeepers are staff journeys (service shafts only): each housekeeping
 * unit fields up to housekeepersPerUnit concurrent cleaners; a cleaner dwells
 * cleanMinutes in the room and people.ts clears `dirty` when the dwell ends.
 * In-flight cleaner counts are DERIVED from state.people (no hidden rosters).
 *
 * rng consumption (fixed order): guest tier draws at the 18:00 planning tick.
 * Pending check-in/checkout spawns live in a WeakMap and are included in
 * deterministic save snapshots.
 */

import type { EngineState, IncomeTier, ItemKind, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { spawnPerson, streetEntrance } from './people'
import { pickWeighted } from './rng'

export const HOTEL_ROOM_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['hotel1p', 'hotel2p', 'hotelSuite'])

const CHECKIN = { start: 18 * 60, end: 22 * 60 }
const CHECKOUT = { start: 7 * 60, end: 9 * 60 }

export interface PendingGuest {
  roomId: number
  tier: IncomeTier
  direction: 'in' | 'out'
}

interface HotelAux {
  pending: Map<number, PendingGuest[]>
}

export interface HotelRuntimeSnapshot {
  pending: Array<[number, PendingGuest[]]>
}

const auxMap = new WeakMap<EngineState, HotelAux>()

function getAux(state: EngineState): HotelAux {
  let aux = auxMap.get(state)
  if (!aux) {
    aux = { pending: new Map() }
    auxMap.set(state, aux)
  }
  return aux
}

export function snapshotHotelRuntime(state: EngineState): HotelRuntimeSnapshot {
  return {
    pending: [...getAux(state).pending.entries()].map(([minute, guests]) => [minute, guests.map((guest) => ({ ...guest }))]),
  }
}

export function restoreHotelRuntime(state: EngineState, snapshot: HotelRuntimeSnapshot): void {
  auxMap.set(state, {
    pending: new Map(snapshot.pending.map(([minute, guests]) => [minute, guests.map((guest) => ({ ...guest }))])),
  })
}

function schedule(state: EngineState, minute: number, guest: PendingGuest): void {
  const aux = getAux(state)
  const list = aux.pending.get(minute)
  if (list) {
    list.push(guest)
  } else {
    aux.pending.set(minute, [guest])
  }
}

function unitsInIdOrder(state: EngineState): Unit[] {
  return state.units // id-ascending by EngineState invariant — no sort needed
}

export function hotelReceptionExists(state: EngineState): boolean {
  return state.units.some((u) => u.kind === 'hotelReception' && !u.offline)
}

export function isHotelRoom(unit: Unit): boolean {
  return HOTEL_ROOM_KINDS.has(unit.kind)
}

function hotelRooms(state: EngineState): Unit[] {
  return unitsInIdOrder(state).filter(isHotelRoom)
}

/** A room a guest can check into tonight. */
function isBookable(unit: Unit): boolean {
  return !unit.occupied && !unit.dirty && !unit.offline && !unit.infested && !unit.flags.noRoute && !unit.flags.noReception
}

/** Nightly demand per the spec formula (rooms, not people). */
export function nightlyGuestTarget(state: EngineState): number {
  const rooms = hotelRooms(state)
  if (rooms.length === 0) {
    return 0
  }
  const avgEval = rooms.reduce((sum, room) => sum + room.evalScore, 0) / rooms.length
  const s = TUNING.spawn
  const rate = Math.min(s.hotelOccMax, s.hotelOccBase + s.hotelOccPerStar * state.star + (s.hotelOccEvalFactor * avgEval) / 100)
  return Math.round(rooms.length * rate)
}

function guestWindowMinute(window: { start: number; end: number }, i: number, n: number): number {
  return window.start + Math.floor(((i + 0.5) * (window.end - window.start)) / n)
}

/** 18:00 — book tonight's rooms (rng: non-luxury guest tier draws, room id order). */
function planCheckIns(state: EngineState): void {
  if (!hotelReceptionExists(state)) {
    return
  }
  const bookable = hotelRooms(state).filter(isBookable)
  const target = Math.min(nightlyGuestTarget(state), bookable.length)
  const tierEntries = (['low', 'med', 'high'] as const).map((tier) => ({
    value: tier as IncomeTier,
    weight: TUNING.people.visitorTierMix[tier],
  }))
  for (let i = 0; i < target; i++) {
    const room = bookable[i]!
    const tier: IncomeTier = room.grade === 'luxury' ? TUNING.hotel.luxuryMinTier : pickWeighted(state.rng, tierEntries)
    schedule(state, guestWindowMinute(CHECKIN, i, target), { roomId: room.id, tier, direction: 'in' })
  }
}

/** 07:00 — plan checkouts for every room that hosted a guest overnight. */
function planCheckOuts(state: EngineState): void {
  const occupied = hotelRooms(state).filter((room) => room.occupied)
  occupied.forEach((room, i) => {
    const pop = room.population
    const tier: IncomeTier = pop.vip > 0 ? 'vip' : pop.high > 0 ? 'high' : pop.med > 0 ? 'med' : 'low'
    schedule(state, guestWindowMinute(CHECKOUT, i, occupied.length), { roomId: room.id, tier, direction: 'out' })
  })
}

function spawnGuest(state: EngineState, guest: PendingGuest): void {
  const entrance = streetEntrance(state)
  const room = state.units.find((u) => u.id === guest.roomId)
  if (!entrance || !room || !isHotelRoom(room)) {
    return
  }
  if (guest.direction === 'in') {
    if (!isBookable(room)) {
      return
    }
    spawnPerson(state, {
      tier: guest.tier,
      floor: entrance.floor,
      x: entrance.x,
      toFloor: room.floor,
      toX: room.x,
      purpose: 'hotelCheckIn',
      destUnitId: room.id,
      tenantUnitId: room.id,
    })
    return
  }
  if (!room.occupied) {
    return
  }
  // Tenancy ends as the guest leaves the room; it turns dirty behind them.
  room.occupied = false
  room.population = { low: 0, med: 0, high: 0, vip: 0 }
  room.dirty = true
  room.vacancyReason = null
  spawnPerson(state, {
    tier: guest.tier,
    floor: room.floor,
    x: room.x,
    toFloor: entrance.floor,
    toX: entrance.x,
    purpose: 'hotelCheckOut',
    tenantUnitId: room.id,
  })
}

// ── Housekeeping ─────────────────────────────────────────────────────────────

/** Derived in-flight cleaner roster: person purpose 'housekeeping'. */
function activeCleaners(state: EngineState): { byHome: Map<number, number>; roomsBeingCleaned: Set<number> } {
  const byHome = new Map<number, number>()
  const roomsBeingCleaned = new Set<number>()
  for (const person of state.people) {
    if (person.purpose !== 'housekeeping') {
      continue
    }
    if (person.tenantUnitId !== null) {
      byHome.set(person.tenantUnitId, (byHome.get(person.tenantUnitId) ?? 0) + 1)
    }
    if (person.destUnitId !== null) {
      roomsBeingCleaned.add(person.destUnitId)
    }
  }
  return { byHome, roomsBeingCleaned }
}

/** Dispatch available housekeepers at dirty rooms (staff routing — service shafts only). */
function dispatchHousekeeping(state: EngineState): void {
  const dirtyRooms = hotelRooms(state).filter((room) => room.dirty && !room.occupied)
  if (dirtyRooms.length === 0) {
    return
  }
  const stations = unitsInIdOrder(state).filter((u) => u.kind === 'housekeeping' && !u.offline)
  if (stations.length === 0) {
    return
  }
  const { byHome, roomsBeingCleaned } = activeCleaners(state)
  for (const room of dirtyRooms) {
    if (roomsBeingCleaned.has(room.id)) {
      continue
    }
    const station = stations.find((s) => (byHome.get(s.id) ?? 0) < TUNING.hotel.housekeepersPerUnit)
    if (!station) {
      return
    }
    const cleaner = spawnPerson(state, {
      tier: 'low',
      floor: station.floor,
      x: station.x,
      toFloor: room.floor,
      toX: room.x,
      purpose: 'housekeeping',
      staff: true,
      tenantUnitId: station.id,
      destUnitId: room.id,
      dwellMin: TUNING.hotel.cleanMinutes,
    })
    if (cleaner) {
      byHome.set(station.id, (byHome.get(station.id) ?? 0) + 1)
    }
  }
}

/** Per-minute hotel hook, called from schedules.minuteTick. */
export function stepHotelMinute(state: EngineState, minute: number): void {
  const aux = getAux(state)
  const due = aux.pending.get(minute)
  if (due) {
    aux.pending.delete(minute)
    for (const guest of due) {
      spawnGuest(state, guest)
    }
  }
  if (minute === CHECKIN.start) {
    planCheckIns(state)
  }
  if (minute === CHECKOUT.start) {
    planCheckOuts(state)
  }
  if (minute % 10 === 0) {
    dispatchHousekeeping(state)
  }
}

/** Flag refresh used by occupancyPass: reception dependency + vacant-room reasons. */
export function refreshHotelRoomFlags(state: EngineState, unit: Unit): void {
  if (!isHotelRoom(unit)) {
    return
  }
  unit.flags.noReception = !hotelReceptionExists(state)
  if (!unit.occupied) {
    if (unit.flags.noReception) {
      unit.vacancyReason = 'noReception'
    } else if (unit.dirty) {
      unit.vacancyReason = 'hotelDirty'
    }
  }
}
