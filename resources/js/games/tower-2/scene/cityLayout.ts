import type { Room } from '../engine/building'

export interface CitySite { width: number, depth: number }
export interface CityRect { x: number, y: number, width: number, depth: number }
export interface StreetProp extends CityRect { kind: 'tree' | 'lamp' | 'bench' | 'bus-stop' | 'car' }
export interface StreetLayout {
  /** Reserved approaches extend through the sidewalk and the kerbside lane. */
  approaches: readonly { x0: number, x1: number }[]
  crosswalkX: number
  props: StreetProp[]
}

/** A wider-than-door clear strip leaves room beside people entering the building. */
export const APPROACH_HALF_WIDTH = 1.25

/** Read-only presentation layout; never paints or reserves any simulation tiles. */
export function streetLayout(site: CitySite, entrance: { x: number, y: number } | null, rooms: readonly Pick<Room, 'floor' | 'storefront' | 'door'>[]): StreetLayout {
  const crosswalkX = site.width / 2
  const approaches = [crosswalkX, ...(entrance ? [entrance.x + 0.5] : []), ...rooms.filter(room => room.floor === 0 && room.storefront).map(room => room.door.x + 0.5)]
    .map(x => ({ x0: x - APPROACH_HALF_WIDTH, x1: x + APPROACH_HALF_WIDTH }))
  const props: StreetProp[] = []
  const place = (kind: StreetProp['kind'], x: number, y: number, width: number, depth: number): boolean => {
    const rect = { kind, x: x - width / 2, y: y - depth / 2, width, depth }
    if (rect.x < 0.4 || rect.x + width > site.width - 0.4
      || approaches.some(gap => rect.x < gap.x1 && rect.x + width > gap.x0)
      || props.some(other => rect.x < other.x + other.width + 0.2 && rect.x + width + 0.2 > other.x && rect.y < other.y + other.depth + 0.2 && rect.y + depth + 0.2 > other.y)) return false
    props.push(rect)
    return true
  }
  // Choose room for the largest props first. Smaller lots simply fit fewer props.
  for (const [kind, preferred, width, depth] of [['bus-stop', 0.82, 2.4, 0.7], ['bench', 0.15, 1.5, 0.5]] as const) {
    const candidates = Array.from({ length: Math.floor(site.width / 2) }, (_, i) => 1 + i * 2)
      .sort((a, b) => Math.abs(a - site.width * preferred) - Math.abs(b - site.width * preferred) || a - b)
    for (const x of candidates) if (place(kind, x, site.depth + 1.45, width, depth)) break
  }
  const nearby = (kind: StreetProp['kind'], x: number, y: number, width: number, depth: number) => {
    for (const shift of [0, 1, -1, 2, -2]) if (place(kind, x + shift, y, width, depth)) break
  }
  for (let x = 4; x < site.width; x += 6) nearby('tree', x, site.depth + 1.25, 1.1, 1.1)
  for (let x = 2; x < site.width; x += 6) nearby('lamp', x, site.depth + 1.82, 0.26, 0.25)
  for (const x of [site.width * 0.25, site.width * 0.75]) place('car', x, site.depth + 2.85, 2.35, 1)
  return { approaches, crosswalkX, props }
}
