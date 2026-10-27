/** One-dimensional grid storage; spatial queries live behind TowerGeometry. */
export * from './gridLayers'
export type { Segment, StopDistanceOpts } from './towerGeometry'

import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'

export const GRID_BOUNDS = { GRID_WIDTH, FLOOR_MIN, FLOOR_MAX } as const
