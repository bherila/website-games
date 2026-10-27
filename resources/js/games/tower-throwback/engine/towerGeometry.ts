/**
 * Spatial queries used by the simulation. Storage, map rules and game policy
 * stay with their existing owners; this seam supplies their geometry only.
 * Runtime geometry is not serialized and consumes no random numbers.
 */
import type { EngineState, Unit } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import { shaftDef } from './catalog'
import { tileIndex } from './gridLayers'

export interface Segment {
  floor: number
  x0: number
  x1: number
}

/** Omit width for a continuous point (for example a walking person). */
export interface HorizontalPosition {
  x: number
  width?: number
  /** Preserve an already computed inclusive endpoint without reconstructing it. */
  endX?: number
}

export interface Footprint extends HorizontalPosition {
  floor: number
  width: number
  storeys: number
}

export interface StopDistanceOpts {
  /** Measure enabled stops rather than every physical landing. */
  enabledOnly?: boolean
}

/** Membership only: callers retain their filters and read mutable unit fields live. */
export interface FloorUnitIndex {
  readonly byFloor: ReadonlyMap<number, readonly Unit[]>
  add(unit: Unit): void
  near(floor: number, reach: number): readonly Unit[]
}

export interface TowerGeometry {
  segments(state: EngineState, cached?: boolean): Map<number, Segment[]>
  segmentOf(state: EngineState, floor: number, x: number): Segment | null
  /** Horizontal distance between points or inclusive tile footprints. */
  distance(a: HorizontalPosition, b: HorizontalPosition): number
  /** Same-floor reach, or overlap on the immediately neighboring floor. */
  adjacent(a: Footprint, b: Footprint, horizontalReach: number): boolean
  /** Same-floor neighbors at the outer edges of any source, in candidate order. */
  touchingNeighbors(sources: readonly Unit[], candidates: readonly Unit[], floor: number): Unit[]
  footprintCells(unit: Footprint): Iterable<{ floor: number; x: number }>
  nearestStop(state: EngineState, floor: number, x: number, opts?: StopDistanceOpts): number
  /** Nearest fully contained candidate on the receiver's walkable segment. */
  nearestOnSegment(state: EngineState, unit: Unit, candidates: readonly Unit[]): number
  createUnitIndex(): FloorUnitIndex
}

const geometries = new WeakMap<EngineState, TowerGeometry>()

export function geometryFor(state: EngineState): TowerGeometry {
  return geometries.get(state) ?? oneDimensionalGeometry
}

/** Install before running an engine state; keep geometry outside save payloads. */
export function setTowerGeometry(state: EngineState, geometry: TowerGeometry): void {
  geometries.set(state, geometry)
}

/** Maximal contiguous walkable (slab-covered) runs per floor. */
function floorSegments(state: EngineState): Map<number, Segment[]> {
  const result = new Map<number, Segment[]>()
  for (let floor = FLOOR_MIN; floor <= FLOOR_MAX; floor++) {
    const runs: Segment[] = []
    let runStart = -1
    for (let x = 0; x < GRID_WIDTH; x++) {
      const covered = state.grid.slab[tileIndex(floor, x)] === 1
      if (covered && runStart < 0) {
        runStart = x
      } else if (!covered && runStart >= 0) {
        runs.push({ floor, x0: runStart, x1: x - 1 })
        runStart = -1
      }
    }
    if (runStart >= 0) {
      runs.push({ floor, x0: runStart, x1: GRID_WIDTH - 1 })
    }
    if (runs.length > 0) {
      result.set(floor, runs)
    }
  }
  return result
}

interface SegmentCache {
  version: number
  segments: Map<number, Segment[]>
}

const segmentCache = new WeakMap<EngineState, SegmentCache>()

/** Memoized `floorSegments`, invalidated when `structureVersion` changes. */
function getSegments(state: EngineState): Map<number, Segment[]> {
  const cached = segmentCache.get(state)
  if (cached && cached.version === state.structureVersion) {
    return cached.segments
  }
  const segments = floorSegments(state)
  segmentCache.set(state, { version: state.structureVersion, segments })
  return segments
}

function segmentContaining(state: EngineState, floor: number, x: number): Segment | null {
  const runs = getSegments(state).get(floor)
  if (!runs) {
    return null
  }
  return runs.find((run) => x >= run.x0 && x <= run.x1) ?? null
}

/**
 * Tiles from `(floor, x)` to the nearest shaft stop on the same floor segment.
 * A shaft qualifies only if one of its stop-serving columns lies inside the
 * segment containing `x`. Returns `Infinity` when no such stop exists.
 */
function nearestShaftStopDistance(
  state: EngineState,
  floor: number,
  x: number,
  opts: StopDistanceOpts = {},
): number {
  const segment = segmentContaining(state, floor, x)
  if (!segment) {
    return Infinity
  }
  let best = Infinity
  for (const shaft of state.shafts) {
    const stops = opts.enabledOnly ? shaft.enabledStops : shaft.stops
    if (!stops.includes(floor)) {
      continue
    }
    const width = shaftDef(shaft.kind).width
    const lo = shaft.x
    const hi = shaft.x + width - 1
    if (hi < segment.x0 || lo > segment.x1) {
      continue
    }
    const gap = x < lo ? lo - x : x > hi ? x - hi : 0
    best = Math.min(best, gap)
  }
  return best
}

function distance(a: HorizontalPosition, b: HorizontalPosition): number {
  // Keep continuous point arithmetic exact: x + 1 - 1 may round differently.
  if (a.width === undefined && a.endX === undefined && b.width === undefined && b.endX === undefined) {
    return Math.abs(a.x - b.x)
  }
  const aHi = a.endX ?? (a.width === undefined ? a.x : a.x + a.width - 1)
  const bHi = b.endX ?? (b.width === undefined ? b.x : b.x + b.width - 1)
  if (b.x > aHi) {
    return b.x - aHi
  }
  if (a.x > bHi) {
    return a.x - bHi
  }
  return 0
}

function createUnitIndex(): FloorUnitIndex {
  const byFloor = new Map<number, Unit[]>()
  const memo = new Map<number, Map<number, Unit[]>>()
  return {
    byFloor,
    add(unit) {
      const list = byFloor.get(unit.floor)
      if (list) {
        list.push(unit)
      } else {
        byFloor.set(unit.floor, [unit])
      }
      memo.clear()
    },
    near(floor, reach) {
      let byReach = memo.get(floor)
      if (!byReach) {
        byReach = new Map()
        memo.set(floor, byReach)
      }
      const cached = byReach.get(reach)
      if (cached) {
        return cached
      }
      const merged: Unit[] = []
      for (let f = floor - reach; f <= floor + reach; f++) {
        const list = byFloor.get(f)
        if (list) {
          merged.push(...list)
        }
      }
      merged.sort((a, b) => a.id - b.id)
      byReach.set(reach, merged)
      return merged
    },
  }
}

export const oneDimensionalGeometry: TowerGeometry = {
  segments: (state, cached = true) => cached ? getSegments(state) : floorSegments(state),
  segmentOf: segmentContaining,
  distance,
  adjacent(a, b, horizontalReach) {
    if (a.floor === b.floor) {
      return distance(a, b) <= horizontalReach
    }
    return Math.abs(a.floor - b.floor) === 1 && distance(a, b) === 0
  },
  touchingNeighbors(sources, candidates, floor) {
    const edges = new Set<number>()
    for (const source of sources) {
      if (source.floor === floor) {
        edges.add(source.x - 1)
        edges.add(source.x + source.width)
      }
    }
    return candidates.filter((candidate) => candidate.floor === floor &&
      (edges.has(candidate.x + candidate.width - 1) || edges.has(candidate.x)))
  },
  *footprintCells(unit) {
    for (let floor = unit.floor; floor <= unit.floor + unit.storeys - 1; floor++) {
      for (let x = unit.x; x <= unit.x + unit.width - 1; x++) {
        yield { floor, x }
      }
    }
  },
  nearestStop: nearestShaftStopDistance,
  nearestOnSegment(state, unit, candidates) {
    const segment = segmentContaining(state, unit.floor, unit.x)
    if (!segment) {
      return Infinity
    }
    let nearest = Infinity
    for (const other of candidates) {
      if (other.floor !== unit.floor || other.x < segment.x0 || other.x + other.width - 1 > segment.x1) {
        continue
      }
      const gap = distance(unit, other)
      if (gap < nearest) {
        nearest = gap
      }
    }
    return nearest
  },
  createUnitIndex,
}
