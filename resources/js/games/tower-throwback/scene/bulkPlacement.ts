export interface Tile {
  floor: number
  x: number
}

export interface BulkCell {
  floor: number
  x: number
}

const BULK_CELL_CAP = 400

/**
 * Cells for a shift-drag: floors min..max stepping `storeys`, columns from min-x
 * stepping `width` while the whole footprint fits inside the dragged x-range.
 * Per-tile items return one cell per floor when the caller passes the row width.
 * Degenerate drags return the single anchor cell. Hard-capped at 400 cells.
 */
export function bulkPlacementCells(itemWidth: number, itemStoreys: number, anchor: Tile, current: Tile): BulkCell[] {
  if (anchor.floor === current.floor && anchor.x === current.x) {
    return [{ floor: anchor.floor, x: anchor.x }]
  }

  const width = Math.max(1, Math.trunc(itemWidth))
  const storeys = Math.max(1, Math.trunc(itemStoreys))
  const minFloor = Math.min(anchor.floor, current.floor)
  const maxFloor = Math.max(anchor.floor, current.floor)
  const minX = Math.min(anchor.x, current.x)
  const maxX = Math.max(anchor.x, current.x)
  const cells: BulkCell[] = []

  for (let floor = minFloor; floor + storeys - 1 <= maxFloor && cells.length < BULK_CELL_CAP; floor += storeys) {
    for (let x = minX; x + width - 1 <= maxX && cells.length < BULK_CELL_CAP; x += width) {
      cells.push({ floor, x })
    }
  }

  return cells.length > 0 ? cells : [{ floor: anchor.floor, x: anchor.x }]
}
