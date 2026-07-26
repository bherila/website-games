import type { GridPos } from '../gameTypes'
import type { MapDef } from '../maps/mapTypes'
import { cellKindAt, cellSurfaceHeight, compassVector, LOW_WALL_HEIGHT, rampDirAt } from '../maps/mapTypes'
import { cellKey } from './grid'

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * Largest surface-height climb a grounded craft can drive up in one cell
 * step, derived from the wall height so retuning LOW_WALL_HEIGHT keeps
 * ramps drivable: one ramp step is LOW_WALL_HEIGHT / 2, and a cliff face
 * (full LOW_WALL_HEIGHT) must stay above the threshold.
 */
export const MAX_DRIVE_CLIMB = LOW_WALL_HEIGHT / 2 + 0.2

/** A jump apex clears LOW_WALL_HEIGHT, so a jumping craft can mount anything standable. */
export const MAX_JUMP_CLIMB = LOW_WALL_HEIGHT + 0.1

/**
 * Walkable-surface height where a cell meets the edge faced by (edgeDc,
 * edgeDr), or Infinity when that face is not passable. Ramps are passable
 * only along their slope axis — 0 at the downhill edge, LOW_WALL_HEIGHT at
 * the uphill edge — mirroring the physics, where ramp side faces are solid.
 */
function edgeSurfaceHeight(map: MapDef, col: number, row: number, edgeDc: number, edgeDr: number): number {
  const kind = cellKindAt(map, col, row)
  if (kind === 'wallHigh') {
    return Number.POSITIVE_INFINITY
  }
  if (kind === 'wallLow' || kind === 'platform') {
    return LOW_WALL_HEIGHT
  }
  if (kind === 'ramp') {
    const dir = rampDirAt(map, col, row)
    if (!dir) {
      return Number.POSITIVE_INFINITY
    }
    const uphill = compassVector(dir)
    if (uphill.x === edgeDc && uphill.z === edgeDr) {
      return LOW_WALL_HEIGHT
    }
    if (uphill.x === -edgeDc && uphill.z === -edgeDr) {
      return 0
    }
    return Number.POSITIVE_INFINITY
  }
  return 0
}

/**
 * Whether a grounded craft can step from one cell into a 4-neighbor:
 * heights are compared at the SHARED edge (so a ramp is entered only via
 * its downhill or uphill end), climbs are capped, descents are free.
 */
export function canStep(map: MapDef, from: GridPos, toCol: number, toRow: number, maxClimb: number): boolean {
  const dc = toCol - from.col
  const dr = toRow - from.row
  const exitHeight = edgeSurfaceHeight(map, from.col, from.row, dc, dr)
  const entryHeight = edgeSurfaceHeight(map, toCol, toRow, -dc, -dr)
  if (!Number.isFinite(exitHeight) || !Number.isFinite(entryHeight)) {
    return false
  }
  return entryHeight - exitHeight <= maxClimb
}

export interface ReachableOptions {
  /** Allow jump-height climbs (player with jump power) instead of drive-only. */
  allowJump?: boolean
  /** Cells to treat as impassable (e.g. tentative sticky-trap placements). */
  blocked?: ReadonlySet<string>
}

/**
 * All walkable cells reachable from start by ground travel: climbs are only
 * possible via ramps (or, with allowJump, jump-height steps); any descent is
 * allowed. The drone never jumps, so drone reachability uses the default.
 */
export function reachableCells(map: MapDef, start: GridPos, options: ReachableOptions = {}): Set<string> {
  const seen = new Set<string>()
  if (!Number.isFinite(cellSurfaceHeight(map, start.col, start.row))) {
    return seen
  }
  const maxClimb = options.allowJump ? MAX_JUMP_CLIMB : MAX_DRIVE_CLIMB

  seen.add(cellKey(start))
  const queue: GridPos[] = [start]
  let head = 0
  while (head < queue.length) {
    const cell = queue[head]
    head += 1
    if (!cell) {
      break
    }
    for (const [dc, dr] of NEIGHBORS) {
      const col = cell.col + dc
      const row = cell.row + dr
      const key = `${col},${row}`
      if (!seen.has(key) && !options.blocked?.has(key) && canStep(map, cell, col, row, maxClimb)) {
        seen.add(key)
        queue.push({ col, row })
      }
    }
  }
  return seen
}

/**
 * A* shortest path on the 4-connected walkable graph (directed: climbs only
 * via ramps, descents free). `blocked` cells are avoided — the drone routes
 * around sticky traps. Returns the cell path including start and goal, or
 * null when unreachable. Maps are tiny (~500 cells) so a linear-scan open
 * list is plenty.
 */
export function findPath(map: MapDef, start: GridPos, goal: GridPos, blocked?: ReadonlySet<string>): GridPos[] | null {
  if (
    !Number.isFinite(cellSurfaceHeight(map, start.col, start.row)) ||
    cellKindAt(map, goal.col, goal.row) === 'wallHigh' ||
    blocked?.has(cellKey(goal))
  ) {
    return null
  }

  const startKey = cellKey(start)
  const goalKey = cellKey(goal)
  const gScore = new Map<string, number>([[startKey, 0]])
  const cameFrom = new Map<string, string>()
  const cellByKey = new Map<string, GridPos>([[startKey, start]])
  const open = new Map<string, number>([[startKey, heuristic(start, goal)]])
  const closed = new Set<string>()

  while (open.size > 0) {
    let currentKey = ''
    let bestF = Infinity
    for (const [key, f] of open) {
      if (f < bestF) {
        bestF = f
        currentKey = key
      }
    }

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, cellByKey, currentKey)
    }

    open.delete(currentKey)
    closed.add(currentKey)
    const current = cellByKey.get(currentKey)
    const currentG = gScore.get(currentKey)
    if (!current || currentG === undefined) {
      continue
    }

    for (const [dc, dr] of NEIGHBORS) {
      const col = current.col + dc
      const row = current.row + dr
      if (!canStep(map, current, col, row, MAX_DRIVE_CLIMB)) {
        continue
      }
      const neighborKey = `${col},${row}`
      if (closed.has(neighborKey) || blocked?.has(neighborKey)) {
        continue
      }

      const tentativeG = currentG + 1
      const knownG = gScore.get(neighborKey)
      if (knownG !== undefined && tentativeG >= knownG) {
        continue
      }

      const neighbor = { col, row }
      cellByKey.set(neighborKey, neighbor)
      cameFrom.set(neighborKey, currentKey)
      gScore.set(neighborKey, tentativeG)
      open.set(neighborKey, tentativeG + heuristic(neighbor, goal))
    }
  }

  return null
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

function reconstructPath(cameFrom: Map<string, string>, cellByKey: Map<string, GridPos>, endKey: string): GridPos[] {
  const path: GridPos[] = []
  let key: string | undefined = endKey
  while (key !== undefined) {
    const cell = cellByKey.get(key)
    if (!cell) {
      break
    }
    path.push(cell)
    key = cameFrom.get(key)
  }
  return path.reverse()
}
