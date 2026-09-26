import type { Cell, LevelDef, PiecePlacement } from '../levels/levelTypes'
import { type PieceId, PIECES, pieceVariant, type Vec2, type WallDef } from '../pieces/pieceCatalog'

export interface BoardSize {
  cols: number
  rows: number
}

/** World-space centre of a cell (+y up, board spans x∈[0, cols], y∈[0, rows]). */
export function cellCenter(board: BoardSize, cell: Cell): Vec2 {
  return [cell.col + 0.5, board.rows - cell.row - 0.5]
}

/** Grid cell under a world-space point, or null when off the board. */
export function worldToCell(board: BoardSize, x: number, y: number): Cell | null {
  const col = Math.floor(x)
  const row = Math.floor(board.rows - y)
  if (col < 0 || row < 0 || col >= board.cols || row >= board.rows) {
    return null
  }

  return { col, row }
}

export function cellKey(cell: Cell): string {
  return `${cell.col},${cell.row}`
}

export function placementSize(placement: Pick<PiecePlacement, 'pieceId' | 'variant'>): { w: number; h: number } {
  const variant = pieceVariant(placement.pieceId, placement.variant)

  return { w: variant.w, h: variant.h }
}

export function footprintCells(placement: PiecePlacement): Cell[] {
  const { w, h } = placementSize(placement)
  const cells: Cell[] = []
  for (let row = placement.row; row < placement.row + h; row += 1) {
    for (let col = placement.col; col < placement.col + w; col += 1) {
      cells.push({ col, row })
    }
  }

  return cells
}

/** Maps a local piece point (origin bottom-left of footprint, +y up) to world space. */
export function localToWorld(board: BoardSize, placement: PiecePlacement, point: Vec2): Vec2 {
  const { w, h } = placementSize(placement)
  const localX = placement.flipped ? w - point[0] : point[0]

  return [placement.col + localX, board.rows - placement.row - h + point[1]]
}

export interface WorldWall extends Required<Omit<WallDef, 'points'>> {
  points: Vec2[]
}

/**
 * World-space walls for a placement. Flipping mirrors x, which reverses a polyline's
 * handedness, so the point order is reversed to keep the solid on the right-hand side.
 */
export function placementWalls(board: BoardSize, placement: PiecePlacement): WorldWall[] {
  const piece = PIECES[placement.pieceId]
  const variant = pieceVariant(placement.pieceId, placement.variant)

  return variant.walls.map((wall) => {
    const points = wall.points.map((point) => localToWorld(board, placement, point))
    if (placement.flipped) {
      points.reverse()
    }

    return {
      points,
      thickness: wall.thickness ?? 0.1,
      material: wall.material ?? piece.material,
    }
  })
}

/** Cells occupied by the level itself (dropper, basket, blocks, pegs, fixed pieces, no-build). */
export function reservedCells(level: LevelDef): Set<string> {
  const reserved = new Set<string>()
  reserved.add(cellKey(level.start))
  reserved.add(cellKey(level.goal))
  for (const block of level.blocks) {
    for (let row = block.row; row < block.row + block.h; row += 1) {
      for (let col = block.col; col < block.col + block.w; col += 1) {
        reserved.add(cellKey({ col, row }))
      }
    }
  }
  for (const peg of level.pegs) {
    reserved.add(cellKey(peg))
  }
  for (const fixed of level.fixed) {
    for (const cell of footprintCells(fixed)) {
      reserved.add(cellKey(cell))
    }
  }
  for (const cell of level.noBuild) {
    reserved.add(cellKey(cell))
  }

  return reserved
}

export type PlacementProblem = 'out-of-bounds' | 'blocked' | 'overlap' | 'no-inventory'

/**
 * Checks whether `candidate` may go on the board. `ignoreIndex` skips one existing
 * placement (the piece being moved/rotated) for overlap and inventory accounting.
 */
export function placementProblem(
  level: LevelDef,
  placements: readonly PiecePlacement[],
  candidate: PiecePlacement,
  ignoreIndex: number | null = null,
): PlacementProblem | null {
  const { w, h } = placementSize(candidate)
  if (candidate.col < 0 || candidate.row < 0 || candidate.col + w > level.cols || candidate.row + h > level.rows) {
    return 'out-of-bounds'
  }

  const reserved = reservedCells(level)
  const cells = footprintCells(candidate)
  if (cells.some((cell) => reserved.has(cellKey(cell)))) {
    return 'blocked'
  }

  const occupied = new Set<string>()
  placements.forEach((placement, index) => {
    if (index === ignoreIndex) {
      return
    }
    for (const cell of footprintCells(placement)) {
      occupied.add(cellKey(cell))
    }
  })
  if (cells.some((cell) => occupied.has(cellKey(cell)))) {
    return 'overlap'
  }

  const movingSamePiece = ignoreIndex !== null && placements[ignoreIndex]?.pieceId === candidate.pieceId
  if (!movingSamePiece && remainingCount(level, placements, candidate.pieceId) <= 0) {
    return 'no-inventory'
  }

  return null
}

export function remainingCount(level: LevelDef, placements: readonly PiecePlacement[], pieceId: PieceId): number {
  const allowed = level.inventory[pieceId] ?? 0
  const used = placements.filter((placement) => placement.pieceId === pieceId).length

  return Math.max(0, allowed - used)
}

/** Index of the placement covering `cell`, or -1. */
export function placementAt(placements: readonly PiecePlacement[], cell: Cell): number {
  return placements.findIndex((placement) => footprintCells(placement).some((covered) => covered.col === cell.col && covered.row === cell.row))
}

/** Next rotation variant (cycles). */
export function rotatePlacement<T extends PiecePlacement>(placement: T): T {
  const count = PIECES[placement.pieceId].variants.length

  return { ...placement, variant: (placement.variant + 1) % count }
}

export function flipPlacement<T extends PiecePlacement>(placement: T): T {
  return { ...placement, flipped: !placement.flipped }
}

export function canRotate(pieceId: PieceId): boolean {
  return PIECES[pieceId].variants.length > 1
}

export function canFlip(pieceId: PieceId): boolean {
  return PIECES[pieceId].flippable
}

/** 1 star for a solve, 2 within `par.two` pieces, 3 within `par.three`. */
export function computeStars(piecesUsed: number, par: LevelDef['par']): 1 | 2 | 3 {
  if (piecesUsed <= par.three) {
    return 3
  }
  if (piecesUsed <= par.two) {
    return 2
  }

  return 1
}

/** Whether a placement is the tutorial's piece on its cell *and* in its orientation. */
export function matchesTutorial(placement: PiecePlacement, tutorial: NonNullable<LevelDef['tutorial']>): boolean {
  return placement.pieceId === tutorial.pieceId
    && placement.col === tutorial.cell.col
    && placement.row === tutorial.cell.row
    && placement.variant === tutorial.variant
    && placement.flipped === tutorial.flipped
}

/** Whether a placement sits on the tutorial cell with the tutorial piece, in any orientation. */
export function onTutorialCell(placement: PiecePlacement, tutorial: NonNullable<LevelDef['tutorial']>): boolean {
  return placement.pieceId === tutorial.pieceId && placement.col === tutorial.cell.col && placement.row === tutorial.cell.row
}
