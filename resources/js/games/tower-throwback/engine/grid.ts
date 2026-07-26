/**
 * Grid layer management + floor-segment extraction.
 *
 * Three flat typed-array layers cover floors FLOOR_MIN..FLOOR_MAX × GRID_WIDTH,
 * indexed `(floor − FLOOR_MIN) × GRID_WIDTH + x`. The `slab` layer marks every
 * tile covered by a slab-family unit's base floor (slab / lobby / skylobby /
 * skybridge) and defines walkability; `unit` holds `id + 1` for all other units
 * plus a tall lobby's atrium storeys (floors 1..h−1 stay unbuildable but
 * unwalkable); `shaft` holds `id + 1` for elevator columns. Layers are rebuilt
 * from the entity lists on load and after every placement/demolish — they are
 * never serialized.
 *
 * Slab-family units are ordinary `Unit` entities (one per placement action, with
 * `width` = the contiguous run placed); this keeps the "shaft over lobby OK /
 * over office rejected" rule a single unit-layer lookup and avoids adding a
 * bespoke slab list to the serialized state.
 */

import type { EngineState, GridLayers, ItemKind, Shaft, Unit } from '../gameTypes'
import { FLOOR_COUNT, FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import { shaftDef } from './catalog'

/** Kinds stored in the slab (walkable) layer rather than the unit layer. */
export const SLAB_FAMILY: ReadonlySet<ItemKind> = new Set<ItemKind>(['slab', 'lobby', 'skylobby', 'skybridge'])

export interface Segment {
  floor: number
  x0: number
  x1: number
}

export function isSlabFamily(kind: ItemKind): boolean {
  return SLAB_FAMILY.has(kind)
}

export function createGridLayers(): GridLayers {
  const cells = FLOOR_COUNT * GRID_WIDTH
  return {
    slab: new Uint8Array(cells),
    unit: new Int32Array(cells),
    shaft: new Int32Array(cells),
  }
}

export function inBounds(floor: number, x: number): boolean {
  return floor >= FLOOR_MIN && floor <= FLOOR_MAX && x >= 0 && x < GRID_WIDTH
}

export function tileIndex(floor: number, x: number): number {
  if (!inBounds(floor, x)) {
    throw new RangeError(`tileIndex out of bounds: floor=${floor} x=${x}`)
  }
  return (floor - FLOOR_MIN) * GRID_WIDTH + x
}

export function slabAt(state: EngineState, floor: number, x: number): boolean {
  return inBounds(floor, x) && state.grid.slab[tileIndex(floor, x)] === 1
}

export function unitIdAt(state: EngineState, floor: number, x: number): number {
  if (!inBounds(floor, x)) {
    return 0
  }
  return state.grid.unit[tileIndex(floor, x)] ?? 0
}

export function shaftIdAt(state: EngineState, floor: number, x: number): number {
  if (!inBounds(floor, x)) {
    return 0
  }
  return state.grid.shaft[tileIndex(floor, x)] ?? 0
}

/** The slab-family unit whose BASE floor provides the walkable structure at this tile. */
export function slabOwnerAt(state: EngineState, floor: number, x: number): Unit | null {
  for (const unit of state.units) {
    if (isSlabFamily(unit.kind) && unit.floor === floor && x >= unit.x && x < unit.x + unit.width) {
      return unit
    }
  }
  return null
}

export type Selectable = { type: 'shaft'; shaft: Shaft } | { type: 'unit'; unit: Unit }

/**
 * What a click on this tile selects: shaft, then unit, then the slab-family
 * OWNER of the walkable layer — slabs paint only the slab layer, so without
 * the fallback bare floors were unselectable (and hence undemolishable).
 */
export function selectableAt(state: EngineState, floor: number, x: number): Selectable | null {
  const shaftId = shaftIdAt(state, floor, x)
  if (shaftId !== 0) {
    const shaft = state.shafts.find((s) => s.id === shaftId - 1)
    if (shaft) {
      return { type: 'shaft', shaft }
    }
  }
  const unitId = unitIdAt(state, floor, x)
  if (unitId !== 0) {
    const unit = state.units.find((u) => u.id === unitId - 1)
    if (unit) {
      return { type: 'unit', unit }
    }
  }
  const owner = slabOwnerAt(state, floor, x)
  return owner ? { type: 'unit', unit: owner } : null
}

function paintTile(grid: GridLayers, layer: 'slab' | 'unit' | 'shaft', floor: number, x: number, value: number): void {
  if (!inBounds(floor, x)) {
    return
  }
  grid[layer][tileIndex(floor, x)] = value
}

function paintUnit(grid: GridLayers, unit: Unit): void {
  const slabFamily = isSlabFamily(unit.kind)
  const floorHi = unit.floor + unit.storeys - 1
  for (let floor = unit.floor; floor <= floorHi; floor++) {
    for (let x = unit.x; x < unit.x + unit.width; x++) {
      if (slabFamily && floor === unit.floor) {
        paintTile(grid, 'slab', floor, x, 1)
      } else {
        // Non-slab units on every storey; a tall lobby's atrium storeys land in
        // the unit layer so nothing can be built inside the open space.
        paintTile(grid, 'unit', floor, x, unit.id + 1)
      }
    }
  }
}

function paintShaft(grid: GridLayers, shaft: Shaft): void {
  const width = shaftDef(shaft.kind).width
  for (let floor = shaft.bottomFloor; floor <= shaft.topFloor; floor++) {
    for (let x = shaft.x; x < shaft.x + width; x++) {
      paintTile(grid, 'shaft', floor, x, shaft.id + 1)
    }
  }
}

/** Clears and repopulates all three layers from `state.units` / `state.shafts` in id order. */
export function rebuildGrid(state: EngineState): void {
  state.grid.slab.fill(0)
  state.grid.unit.fill(0)
  state.grid.shaft.fill(0)
  for (const unit of state.units) {
    paintUnit(state.grid, unit)
  }
  for (const shaft of state.shafts) {
    paintShaft(state.grid, shaft)
  }
}

/** Maximal contiguous walkable (slab-covered) runs per floor. */
export function floorSegments(state: EngineState): Map<number, Segment[]> {
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
export function getSegments(state: EngineState): Map<number, Segment[]> {
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

export interface StopDistanceOpts {
  /** Measure against player-enabled stops instead of all physical landings. */
  enabledOnly?: boolean
}

/**
 * Tiles from `(floor, x)` to the nearest shaft stop on the same floor segment.
 * A shaft qualifies only if one of its stop-serving columns lies inside the
 * segment containing `x`. Returns `Infinity` when no such stop exists.
 */
export function nearestShaftStopDistance(
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

export const GRID_BOUNDS = { GRID_WIDTH, FLOOR_MIN, FLOOR_MAX } as const
