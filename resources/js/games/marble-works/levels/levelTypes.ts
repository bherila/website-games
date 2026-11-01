import type { MarbleKind } from '../physics/marbles'
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

/**
 * A dropper cell. Its marbles fall one at a time: marble `i` is released at
 * `delay + i * interval` seconds after Go.
 */
export interface Dropper {
  cell: Cell
  marbles: readonly MarbleKind[]
  /** Seconds before the first release (default 0). */
  delay?: number
  /** Seconds between releases (default `RELEASE_INTERVAL_S`). */
  interval?: number
}

/**
 * A goal basket (footprint 1×1). With `accepts`, only that kind of marble may land in it;
 * with `capacity`, it takes at most that many marbles.
 */
export interface Basket {
  cell: Cell
  accepts?: MarbleKind
  capacity?: number
}

export interface LevelDef {
  id: number
  title: string
  cols: number
  rows: number
  droppers: readonly Dropper[]
  baskets: readonly Basket[]
  /** Gems a marble collects by rolling through their cell. All of them earn a star. */
  gems: readonly Cell[]
  blocks: readonly BlockObstacle[]
  /** Small round pegs centred in a cell. */
  pegs: readonly Cell[]
  /** Pre-built, immovable pieces. */
  fixed: readonly PiecePlacement[]
  /** Cells the player may not build on. */
  noBuild: readonly Cell[]
  inventory: Readonly<Partial<Record<PieceId, number>>>
  /** Most pieces allowed for the par star. Never below the reference solution's length. */
  par: number
  hint?: string
  /**
   * Show the hint on a first visit. Only levels that introduce a piece or marble do:
   * on the later puzzles the hint gives the trick away, so it waits behind the button.
   */
  autoHint?: boolean
  /** Level 1 only: the guided first-run overlay. */
  tutorial?: { pieceId: PieceId; cell: Cell; variant: number; flipped: boolean }
  /** Reference solution proven by the headless physics test: wins and collects every gem. */
  solution: readonly PiecePlacement[]
}
