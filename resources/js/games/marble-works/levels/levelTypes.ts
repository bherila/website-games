import type { PieceId } from '../pieces/pieceCatalog'

/** A grid cell: `col` from the left, `row` from the top. */
export interface Cell {
  col: number
  row: number
}

/** A piece on the board. `col`/`row` is the top-left cell of its footprint. */
export interface PiecePlacement extends Cell {
  pieceId: PieceId
  variant: number
  flipped: boolean
}

export interface PlacedPiece extends PiecePlacement {
  /** Stable id for React keys / selection. */
  uid: string
}

export interface BlockObstacle extends Cell {
  w: number
  h: number
}

export interface LevelDef {
  id: number
  title: string
  cols: number
  rows: number
  /** Dropper cell. The marble rests in it and drops straight down on Go. */
  start: Cell
  /** Basket cell (footprint 1×1). */
  goal: Cell
  blocks: readonly BlockObstacle[]
  /** Small round pegs centred in a cell. */
  pegs: readonly Cell[]
  /** Pre-built, immovable pieces. */
  fixed: readonly PiecePlacement[]
  /** Cells the player may not build on. */
  noBuild: readonly Cell[]
  inventory: Readonly<Partial<Record<PieceId, number>>>
  /** Most pieces allowed for 2 and 3 stars. */
  par: { two: number; three: number }
  hint?: string
  /** Level 1 only: the guided first-run overlay. */
  tutorial?: { pieceId: PieceId; cell: Cell; variant: number; flipped: boolean }
  /** Reference solution proven by the headless physics test. */
  solution: readonly PiecePlacement[]
}
