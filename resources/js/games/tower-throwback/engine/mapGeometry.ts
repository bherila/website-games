/**
 * Map-relative floor geometry.
 *
 * Every directional rule in the engine is currently written against literal
 * floor 0 (`floor < 0` = underground, `floor - 1` = the floor below, …). Those
 * expressions are only correct because CITY_TOWER happens to anchor at 0 and
 * build upward. This module restates each of them relative to the map's own
 * anchor and build direction, so a downward map can reuse the same rules.
 *
 * THE UNIFYING IDEA: measure everything as `depthFromAnchor` — floors travelled
 * from the lobby in the map's build direction. Then
 *
 *   depth > 0  →  built-out territory (city: above ground)
 *   depth = 0  →  the lobby anchor itself
 *   depth < 0  →  the excavated side (city: underground)
 *
 * and every sign test on `floor` becomes the same sign test on `depth`. For an
 * up-anchored-at-0 map the two are literally equal, which is why CITY_TOWER
 * comes through byte-identical.
 *
 * NOTHING HERE CHANGES BEHAVIOUR YET. This module is introduced alone, with an
 * equivalence test proving it agrees with the existing literal expressions
 * across the whole floor range, before any call site is switched over. See the
 * Niagara Falls epic for the call-site census that follows.
 */

import { GRID_WIDTH, type HorizontalBuildExclusion, type MapDefinition } from '../gameTypes'

export interface HorizontalBuildRegion {
  xMin: number
  xMaxExclusive: number
}

export function intersectingBuildExclusion(
  map: MapDefinition,
  xMin: number,
  xMaxExclusive: number,
): HorizontalBuildExclusion | null {
  return map.horizontalBuildExclusions?.find(
    (exclusion) => xMin < exclusion.xMaxExclusive && xMaxExclusive > exclusion.xMin,
  ) ?? null
}

/** Complement of the map's horizontal voids, used by placement guidance. */
export function horizontalBuildRegions(map: MapDefinition): HorizontalBuildRegion[] {
  const exclusions = [...(map.horizontalBuildExclusions ?? [])].sort((a, b) => a.xMin - b.xMin)
  const regions: HorizontalBuildRegion[] = []
  let cursor = 0
  for (const exclusion of exclusions) {
    if (cursor < exclusion.xMin) {
      regions.push({ xMin: cursor, xMaxExclusive: exclusion.xMin })
    }
    cursor = Math.max(cursor, exclusion.xMaxExclusive)
  }
  if (cursor < GRID_WIDTH) {
    regions.push({ xMin: cursor, xMaxExclusive: GRID_WIDTH })
  }
  return regions
}

export function endgamePlacementFloors(map: MapDefinition): readonly number[] {
  return map.endgamePlacementFloors ?? [terminalFloor(map)]
}

/**
 * Which way a cantilevered footprint must overhang for its unsupported tiles to
 * land exactly in the map's void — `null` when it anchors to neither bank.
 *
 * Placement and save import MUST share this: gating the anchor test behind an
 * "does the footprint overlap the void" check lets a deck that misses the void
 * entirely import while remaining unplaceable, so the derivation lives here and
 * is called unconditionally by both.
 */
export function cantileverFacing(
  map: MapDefinition,
  xLo: number,
  xMaxExclusive: number,
  cantileverTiles: number,
): 'left' | 'right' | null {
  const exclusion = map.horizontalBuildExclusions?.[0]
  if (!exclusion || cantileverTiles === 0) {
    return 'right'
  }
  if (xMaxExclusive - cantileverTiles === exclusion.xMin) {
    return 'right'
  }
  if (xLo + cantileverTiles === exclusion.xMaxExclusive) {
    return 'left'
  }
  return null
}

/**
 * Floors travelled from the lobby anchor in the map's build direction.
 * Negative means the excavated side. For an up-map anchored at 0 this is the
 * floor number itself.
 */
export function depthFromAnchor(map: MapDefinition, floor: number): number {
  const delta = floor - map.lobbyAnchorFloor
  const signed = map.buildDirection === 'down' ? -delta : delta

  // Negating zero yields -0, which compares equal to 0 but is a different value
  // to `Object.is`, `toBe`, and anything that uses the result as a Map key.
  // Normalise it here so callers never have to know.
  return signed === 0 ? 0 : signed
}

/** The lobby floor: free support, and the only floor anchoring both directions. */
export function isAnchorFloor(map: MapDefinition, floor: number): boolean {
  return floor === map.lobbyAnchorFloor
}

/**
 * The floor that must exist for `floor` to be supported: one step TOWARD the
 * anchor, from whichever side `floor` sits on. Undefined at the anchor itself,
 * which needs no support — callers must check `isAnchorFloor` first, exactly as
 * the current `validateSupport` returns early at floor 0.
 */
export function supportFloorFor(map: MapDefinition, floor: number): number {
  return floor + Math.sign(map.lobbyAnchorFloor - floor)
}

/**
 * Purely geometric: below the lobby anchor. This is what `undergroundOnly`
 * items (parking, recycling) mean by "underground" — a physical position, not
 * an economic category.
 *
 * Kept SEPARATE from `isExcavated` on purpose. Collapsing the two would make
 * every `undergroundOnly` item unplaceable on a map without excavation, with
 * no error explaining why — the item would simply have nowhere legal to go.
 */
export function isBelowAnchor(map: MapDefinition, floor: number): boolean {
  return depthFromAnchor(map, floor) < 0
}

/**
 * "Excavation" ECONOMICS — costs `EXCAVATION_COST` and is gated behind a star.
 *
 * Digging into bedrock below a city lot is excavation. Descending an open cliff
 * face is not, even though both are "below the lobby", so a map can opt out via
 * `excavationBelowAnchor: false` and keep normal cost and availability.
 */
export function isExcavated(map: MapDefinition, floor: number): boolean {
  return isBelowAnchor(map, floor) && map.excavationBelowAnchor !== false
}

/**
 * The default vertical rule ("may only be placed above ground"): anywhere that
 * is not excavation. On a map with no excavated side, ordinary tenants can
 * occupy the whole range — which is the point of a falls map whose identity is
 * the floors below the lobby.
 */
export function isOnBuildSide(map: MapDefinition, floor: number): boolean {
  return !isExcavated(map, floor)
}

/** True when `a` is further out along the build direction than `b`. */
export function isBeyond(map: MapDefinition, a: number, b: number): boolean {
  return depthFromAnchor(map, a) > depthFromAnchor(map, b)
}

/**
 * The prestige floor at the far end of the build direction — where the map's
 * endgame structure goes. City: floor 99; Niagara: floor 15.
 */
export function terminalFloor(map: MapDefinition): number {
  return map.buildDirection === 'down' ? map.floorRange.min : map.floorRange.max
}

/**
 * The extreme of the excavated side — where the subway goes. City: floor −10.
 * On a map with no excavated side this coincides with the anchor.
 */
export function excavationExtreme(map: MapDefinition): number {
  return map.buildDirection === 'down' ? map.floorRange.max : map.floorRange.min
}

/**
 * Minimum depth for a skylobby. Expressed as a depth rather than an absolute
 * floor so "five floors up from the lobby" survives the axis flipping.
 */
export function meetsMinimumDepth(map: MapDefinition, floor: number, minimumDepth: number): boolean {
  return depthFromAnchor(map, floor) >= minimumDepth
}

/** Absolute-floor delta for one unit of increasing depth: +1 up-maps, −1 down. */
export function buildStep(map: MapDefinition): number {
  return map.buildDirection === 'down' ? -1 : 1
}

/**
 * The floor immediately beyond a unit on the BUILD side — what would rest on it.
 *
 * Takes the unit's whole span, not just its origin. `unit.floor` is the lowest
 * storey on every map (storeys always grow upward in absolute terms), so the
 * outward extreme is the TOP storey on an up-map but the BOTTOM one on a
 * down-map. Using `floor + storeys` unconditionally would land inside a
 * multi-storey unit on a downward map.
 */
export function outwardNeighbour(map: MapDefinition, floorLo: number, floorHi: number): number {
  const step = buildStep(map)

  return (step > 0 ? floorHi : floorLo) + step
}

/** The floor immediately beyond a unit on the EXCAVATED side. */
export function inwardNeighbour(map: MapDefinition, floorLo: number, floorHi: number): number {
  const step = buildStep(map)

  return (step > 0 ? floorLo : floorHi) - step
}

/**
 * Display label. City keeps `B1`/`0`/`42` exactly. A downward map counts plain
 * depth from the crest — "B" reads as basement and is wrong for a gorge.
 */
export function floorLabelFor(map: MapDefinition, floor: number): string {
  const depth = depthFromAnchor(map, floor)
  if (map.buildDirection === 'down') {
    return depth < 0 ? `U${Math.abs(depth)}` : String(depth)
  }

  return floor < 0 ? `B${Math.abs(floor)}` : String(floor)
}
