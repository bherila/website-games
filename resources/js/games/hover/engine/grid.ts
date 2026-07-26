import type { GridPos, Vec2 } from '../gameTypes'
import type { MapDef } from '../maps/mapTypes'
import { cellKindAt } from '../maps/mapTypes'

export function worldToCell(map: MapDef, pos: Vec2): GridPos {
  return {
    col: Math.floor(pos.x / map.cellSize),
    row: Math.floor(pos.z / map.cellSize),
  }
}

/**
 * How far below a surface top a craft may be and still slide onto it. A
 * craft cresting a ramp contacts the platform face while its center is
 * still ~radius short of the top edge (≈ 0.4 below on a one-cell slope),
 * so anything tighter than ~0.5 bounces the craft off the seam. Applies
 * ONLY to ramp-mountable surfaces (platforms, ramp faces) — low walls keep
 * the strict rule "passable only while jumping above lowWallHeight".
 */
export const MOUNT_TOLERANCE = 0.6

/**
 * Whether a cell blocks a craft hovering at the given altitude: high walls
 * always block; low walls block strictly below their top; platforms allow
 * the mount tolerance so a craft cresting a ramp slides on. Ramps report
 * non-solid here — their faces are locally solid against the slope height,
 * which needs the contact point (resolveWallCollisions handles it).
 */
export function isSolidAtAltitude(map: MapDef, col: number, row: number, altitude: number): boolean {
  const kind = cellKindAt(map, col, row)
  if (kind === 'wallHigh') {
    return true
  }
  if (kind === 'wallLow') {
    return altitude < map.lowWallHeight
  }
  if (kind === 'platform') {
    return altitude < map.lowWallHeight - MOUNT_TOLERANCE
  }
  return false
}

export function floorCells(map: MapDef): GridPos[] {
  const cells: GridPos[] = []
  for (let row = 0; row < map.rows.length; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (cellKindAt(map, col, row) === 'floor') {
        cells.push({ col, row })
      }
    }
  }
  return cells
}

export function cellKey(cell: GridPos): string {
  return `${cell.col},${cell.row}`
}

export function gridDistance(a: GridPos, b: GridPos): number {
  return Math.hypot(a.col - b.col, a.row - b.row)
}
