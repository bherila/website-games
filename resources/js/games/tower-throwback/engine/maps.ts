/**
 * Map registry. Placement, catalog availability, spawn schedules, and the scene
 * palette all read the active `MapDefinition`.
 *
 * IMPORTANT — `id` is the save key. `gameProgress.ts` validates a loaded save's
 * `mapId` against `ALL_MAPS`, so renaming an id makes every save on that map
 * unloadable. `name` is the display string and is free to change; that is why
 * the original map is still `city-tower` internally while presenting as
 * "New York".
 *
 * NOT YET SUPPORTED: `buildDirection: 'down'`. The field exists on
 * `MapDefinition` but no production code reads it — a downward map is a real
 * engine change, not a config entry (see the Niagara Falls epic). `getMap`
 * refuses to return such a map rather than letting it half-work, so the failure
 * is a loud error at the registry instead of silently wrong support rules,
 * floor labels, and camera bounds deep in the sim.
 */

import type { MapDefinition } from '../gameTypes'

export const CITY_TOWER: MapDefinition = {
  id: 'city-tower',
  name: 'New York',
  /**
   * Stable single base36 character identifying this map inside a challenge
   * code. NEVER reuse or renumber these — a code shared today must still
   * resolve to the same map years from now.
   */
  codeKey: '0',
  blurb: 'A flat city lot. Build up.',
  lobbyAnchorFloor: 0,
  buildDirection: 'up',
  /**
   * Pinned literals, NOT the global constants. The city lot excavates to B10;
   * that is a game-balance fact about this map, and it must not silently deepen
   * when the world is widened for another map.
   */
  floorRange: { min: -10, max: 99 },
  disallowedItems: ['observationDeck'],
  endgameItem: 'cathedral',
  /** Subway share activates only once a subway station is built (schedules checks). */
  spawnSources: [
    { type: 'street', share: 0.7 },
    { type: 'subway', share: 0.3 },
  ],
  undergroundAllowed: true,
  paletteTheme: 'city',
}

/**
 * Niagara Falls: the lobby sits at the clifftop. Fifteen storeys rise above it
 * and thirty descend the falls face to the gorge floor.
 *
 * NOT a `buildDirection: 'down'` map. It builds both ways from the anchor, so
 * it is structurally the same shape as CITY_TOWER — just different bounds. The
 * axis never inverts, which is why no floor-label, camera, or support-rule
 * inversion is needed.
 *
 * `excavationBelowAnchor: false` is what makes the gorge the map's playable
 * heart rather than a 3★ unlock: descending an open cliff face is not digging.
 */
export const NIAGARA_FALLS: MapDefinition = {
  id: 'niagara-falls',
  name: 'Niagara Falls',
  codeKey: '1',
  blurb: 'A clifftop lot. Build up 15, or down 30 into the gorge.',
  lobbyAnchorFloor: 0,
  buildDirection: 'up',
  floorRange: { min: -30, max: 15 },
  horizontalBuildExclusions: [
    { xMin: 189, xMaxExclusive: 277, label: 'Waterfall gap' },
  ],
  /** No subway reaches the gorge; arrivals are all street level. */
  disallowedItems: ['subway', 'cathedral'],
  endgameItem: 'observationDeck',
  endgamePlacementFloors: [-30, 15],
  spawnSources: [{ type: 'street', share: 1 }],
  undergroundAllowed: true,
  excavationBelowAnchor: false,
  paletteTheme: 'falls',
}

export const ALL_MAPS: Record<string, MapDefinition> = {
  [CITY_TOWER.id]: CITY_TOWER,
  [NIAGARA_FALLS.id]: NIAGARA_FALLS,
}

/** Registry order, used for the map picker. Stable and deterministic. */
export const MAP_ORDER: readonly string[] = [CITY_TOWER.id, NIAGARA_FALLS.id]

export function allMaps(): readonly MapDefinition[] {
  return MAP_ORDER.map((id) => getMap(id))
}

export function getMap(id: string): MapDefinition {
  if (!isKnownMapId(id)) {
    throw new Error(`getMap: unknown map id "${id}"`)
  }
  const map = ALL_MAPS[id]!
  if (map.buildDirection === 'down') {
    throw new Error(
      `getMap: map "${id}" declares buildDirection 'down', which the engine does not implement yet. `
        + 'Downward building requires map-relative floor geometry (see the Niagara Falls epic).',
    )
  }
  return map
}

/** Whether a save's map id is one this build knows how to load. */
export function isKnownMapId(id: string): boolean {
  return Object.hasOwn(ALL_MAPS, id)
}

export function mapByCodeKey(codeKey: string): MapDefinition | null {
  return allMaps().find((map) => map.codeKey === codeKey) ?? null
}
