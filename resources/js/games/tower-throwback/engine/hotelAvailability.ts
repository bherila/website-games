import type { EngineState, ItemKind, Unit } from '../gameTypes'

export const HOTEL_ROOM_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['hotel1p', 'hotel2p', 'hotelSuite'])

export function isHotelRoom(unit: Unit): boolean {
  return HOTEL_ROOM_KINDS.has(unit.kind)
}

export function hotelReceptionExists(state: EngineState): boolean {
  return state.units.some((unit) => unit.kind === 'hotelReception' && !unit.offline)
}

/** Shared physical availability; routing and reception must also be checked. */
export function hotelRoomAvailable(unit: Unit): boolean {
  return isHotelRoom(unit) && !unit.occupied && !unit.dirty && !unit.offline && !unit.infested
}
