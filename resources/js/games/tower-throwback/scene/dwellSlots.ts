import type { Person, Unit } from '../gameTypes'

const DWELL_SLOT_WIDTH_TILES = 0.75

export function isDwellingVisitor(person: Person): person is Person & { destUnitId: number } {
  return person.state === 'walking' && person.legs[person.legIndex] === undefined && person.destUnitId !== null
}

/**
 * Deterministic in-unit x for a dwelling visitor: hash the person id onto
 * 0.75-tile slots across [unit.x + 0.5, unit.x + width - 0.5].
 */
export function dwellSlotX(personId: number, unitX: number, unitWidth: number): number {
  const minX = unitX + 0.5
  const maxX = unitX + Math.max(0.5, unitWidth - 0.5)
  const slots = Math.max(1, Math.floor((maxX - minX) / DWELL_SLOT_WIDTH_TILES) + 1)
  const hash = (personId * 2654435761) >>> 0
  const slot = Math.min(slots - 1, Math.floor((hash / 0x1_0000_0000) * slots))
  return Math.min(maxX, minX + slot * DWELL_SLOT_WIDTH_TILES)
}

export interface DwellRenderSlot {
  floor: number
  x: number
}

/**
 * Observation Deck visitors stand on its full-width upper terrace. Keeping
 * them one floor above the unit anchor prevents a visitor on the six-tile
 * cantilever from appearing underneath its unsupported lower footprint.
 */
export function dwellRenderSlot(personId: number, unit: Unit): DwellRenderSlot {
  if (unit.kind === 'observationDeck') {
    return {
      floor: unit.floor + 1,
      x: dwellSlotX(personId, unit.x + 3, unit.width - 3.5),
    }
  }
  return { floor: unit.floor, x: dwellSlotX(personId, unit.x, unit.width) }
}
