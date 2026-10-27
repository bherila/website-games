/** One-dimensional grid storage and compatibility entry points. */
export * from './gridLayers'
export type { Segment, StopDistanceOpts } from './towerGeometry'

import type { EngineState } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import { geometryFor, type Segment, type StopDistanceOpts } from './towerGeometry'

/** Fresh walkable runs; retained for callers that explicitly need a noncached extraction. */
export function floorSegments(state: EngineState): Map<number, Segment[]> {
  return geometryFor(state).segments(state, false)
}

/** Cached walkable runs, invalidated by structureVersion. */
export function getSegments(state: EngineState): Map<number, Segment[]> {
  return geometryFor(state).segments(state)
}

export function nearestShaftStopDistance(state: EngineState, floor: number, x: number, opts: StopDistanceOpts = {}): number {
  return geometryFor(state).nearestStop(state, floor, x, opts)
}

export const GRID_BOUNDS = { GRID_WIDTH, FLOOR_MIN, FLOOR_MAX } as const
