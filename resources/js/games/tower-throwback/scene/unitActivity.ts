import { itemDef } from '../engine/catalog'
import { isWeekend } from '../engine/clock'
import type { GameClock, Unit } from '../gameTypes'

export type UnitVisualActivity = 'vacant' | 'occupied' | 'sleeping'

const OFFICE_FIRST_ARRIVAL_MINUTE = 7 * 60
const OFFICE_LAST_DEPARTURE_MINUTE = 19 * 60
const RESIDENT_SLEEP_MINUTE = 22 * 60
const RESIDENT_WAKE_MINUTE = 6 * 60
const HOTEL_WAKE_MINUTE = 7 * 60

/** Presentation-only room state; this never feeds occupancy or scheduling. */
export function unitVisualActivity(
  unit: Pick<Unit, 'id' | 'kind' | 'occupied' | 'offline' | 'infested'>,
  clock: GameClock,
  activeVisitorUnitIds: ReadonlySet<number>,
): UnitVisualActivity {
  if (unit.offline || unit.infested) {
    return 'vacant'
  }
  if (unit.kind === 'restroom') {
    return clock.minute >= RESIDENT_WAKE_MINUTE && clock.minute < RESIDENT_SLEEP_MINUTE ? 'occupied' : 'vacant'
  }
  if (!unit.occupied) {
    return 'vacant'
  }

  const category = itemDef(unit.kind).category
  if (category === 'office') {
    return !isWeekend(clock.day)
      && clock.minute >= OFFICE_FIRST_ARRIVAL_MINUTE
      && clock.minute < OFFICE_LAST_DEPARTURE_MINUTE
      ? 'occupied'
      : 'vacant'
  }
  if (category === 'residential') {
    return clock.minute >= RESIDENT_SLEEP_MINUTE || clock.minute < RESIDENT_WAKE_MINUTE ? 'sleeping' : 'occupied'
  }
  if (category === 'hotel') {
    return clock.minute >= RESIDENT_SLEEP_MINUTE || clock.minute < HOTEL_WAKE_MINUTE ? 'sleeping' : 'occupied'
  }
  if (category === 'commerce') {
    return activeVisitorUnitIds.has(unit.id) ? 'occupied' : 'vacant'
  }

  return 'occupied'
}
