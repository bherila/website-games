import { itemDef } from '../engine/catalog'
import { getSegments } from '../engine/grid'
import type { EngineCommand, EngineState } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH, TUNING } from '../gameTypes'

export type PlacementRangeKind = 'benefit' | 'impact'
export const PLACEMENT_RANGE_TILE_CAP = 4_000

export interface PlacementRangeTile {
  floor: number
  kind: PlacementRangeKind
  strength: number
  x: number
}

type PlaceItemCmd = Extract<EngineCommand, { type: 'place' }>

function spanGap(x: number, lo: number, hi: number): number {
  if (x < lo) {
    return lo - x
  }
  if (x > hi) {
    return x - hi
  }
  return 0
}

function restroomRangeTiles(segments: ReturnType<typeof getSegments>, command: PlaceItemCmd): PlacementRangeTile[] {
  const width = command.widthTiles ?? itemDef(command.kind).width
  const hi = command.x + width - 1
  const segment = segments.get(command.floor)?.find((candidate) => command.x >= candidate.x0 && hi <= candidate.x1)
  if (!segment) {
    return []
  }

  const range = TUNING.grid.restroomRangeTiles
  const tiles: PlacementRangeTile[] = []
  const x0 = Math.max(segment.x0, command.x - range)
  const x1 = Math.min(segment.x1, hi + range)
  for (let x = x0; x <= x1; x += 1) {
    const distance = spanGap(x, command.x, hi)
    if (distance === 0) {
      continue
    }
    tiles.push({ floor: command.floor, kind: 'benefit', strength: Math.max(0.15, 1 - distance / range), x })
  }
  return tiles
}

function noiseRangeTiles(command: PlaceItemCmd): PlacementRangeTile[] {
  const definition = itemDef(command.kind)
  const noise = definition.noise
  if (!noise) {
    return []
  }

  const width = command.widthTiles ?? definition.width
  const lo = command.x
  const hi = lo + width - 1
  const tiles: PlacementRangeTile[] = []
  for (let floorDelta = 0; floorDelta < TUNING.noise.floorPropagation.length; floorDelta += 1) {
    const propagation = TUNING.noise.floorPropagation[floorDelta] ?? 0
    const floors = floorDelta === 0 ? [command.floor] : [command.floor - floorDelta, command.floor + floorDelta]
    for (const floor of floors) {
      if (floor < FLOOR_MIN || floor > FLOOR_MAX) {
        continue
      }
      const x0 = Math.max(0, lo - noise.radiusTiles + 1)
      const x1 = Math.min(GRID_WIDTH - 1, hi + noise.radiusTiles - 1)
      for (let x = x0; x <= x1; x += 1) {
        const distance = spanGap(x, lo, hi)
        if (distance === 0 || distance >= noise.radiusTiles) {
          continue
        }
        tiles.push({
          floor,
          kind: 'impact',
          strength: propagation * (1 - distance / noise.radiusTiles),
          x,
        })
      }
    }
  }
  return tiles
}

/** Canonical placement-only range preview; never mutates engine state. */
export function placementRangeTiles(state: EngineState, commands: readonly PlaceItemCmd[]): PlacementRangeTile[] {
  const byTile = new Map<string, PlacementRangeTile>()
  const uniqueCommands = new Map(commands.map((command) => [`${command.kind}:${command.floor}:${command.x}:${command.widthTiles ?? ''}`, command]))
  const segments = commands.some((command) => command.kind === 'restroom') ? getSegments(state) : null
  for (const command of uniqueCommands.values()) {
    const tiles = command.kind === 'restroom' && segments ? restroomRangeTiles(segments, command) : noiseRangeTiles(command)
    for (const tile of tiles) {
      const key = `${tile.kind}:${tile.floor}:${tile.x}`
      const previous = byTile.get(key)
      if (!previous || tile.strength > previous.strength) {
        byTile.set(key, tile)
      }
      if (byTile.size >= PLACEMENT_RANGE_TILE_CAP) {
        return [...byTile.values()]
      }
    }
  }
  return [...byTile.values()]
}
