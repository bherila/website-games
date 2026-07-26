/** Versioned browser-storage keys. Anonymous play uses them directly; authenticated
 *  play routes them through the shared `user_game_data` adapter. */
export const TWENTY48_PROGRESS_STORAGE_KEY = 'bwh.2048.progress.v1'
export const TWENTY48_SAVE_STORAGE_KEY = 'bwh.2048.save.v1'
export const TWENTY48_MUTED_STORAGE_KEY = 'bwh.2048.muted.v1'

export const BOARD_SIZES = [3, 4, 5, 6] as const
export type BoardSize = (typeof BOARD_SIZES)[number]
export const DEFAULT_BOARD_SIZE: BoardSize = 4

/** Reaching this value shows the win overlay once per run. */
export const WINNING_TILE_VALUE = 2048
export const MAX_UNDOS_PER_RUN = 3
/** Chance a spawned tile is a 4 instead of a 2 — the classic ratio. */
export const SPAWN_FOUR_PROBABILITY = 0.1
export const STARTING_TILE_COUNT = 2
/** Pointer travel (px) before a drag counts as a swipe. Matches the other games. */
export const SWIPE_THRESHOLD_PX = 24
/** Tile slide/pop duration; ghosts of merged-away tiles are pruned just after. */
export const TILE_ANIMATION_MS = 120
export const GHOST_LIFETIME_MS = 160

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Tile {
  id: number
  value: number
  row: number
  column: number
}

/**
 * Tile-list board (not a value grid) so every tile keeps a stable id across
 * moves. The renderer keys DOM nodes by id, which is what lets CSS transforms
 * animate a slide instead of repainting the whole grid.
 */
export interface Board {
  size: BoardSize
  tiles: readonly Tile[]
  nextTileId: number
}

export interface MoveOutcome {
  board: Board
  /** Points scored by this move: the sum of every merged tile's new value. */
  gained: number
  moved: boolean
  merges: number
  /**
   * Tiles absorbed by a merge, repositioned onto the merge cell. They are kept
   * mounted for one animation so they visibly slide into the survivor.
   */
  absorbed: readonly Tile[]
  /** Surviving tiles whose value doubled this move (pop animation). */
  mergedTileIds: readonly number[]
}

export type RunStatus = 'playing' | 'won' | 'over'

/** One undo step: the board, score, and RNG position before a move. */
export interface RunSnapshot {
  board: Board
  score: number
  randomSeed: number
}

export interface GameRun {
  version: 1
  board: Board
  score: number
  /**
   * High-water score for the run. Undo lowers `score`, so this — not the live
   * score — is what the Best readout and the recorded result are based on. It
   * lives on the run so a reload cannot forget it.
   */
  bestScore: number
  /** High-water tile for the run, for the same reason as `bestScore`. */
  bestTile: number
  /**
   * True once the run has been counted towards games played. Undo deliberately
   * revives a finished run, so the flag — not the status — is what keeps one
   * physical run from being counted again every time it re-ends or is abandoned.
   */
  recorded: boolean
  status: RunStatus
  /** mulberry32 position, saved so a restored run keeps spawning deterministically. */
  randomSeed: number
  undosRemaining: number
  history: readonly RunSnapshot[]
  /** Latched on the first 2048 so "keep going" is never re-prompted. */
  reachedWinningTile: boolean
  moves: number
}

export interface MoveApplication {
  run: GameRun
  changed: boolean
  outcome: MoveOutcome | null
  spawnedTileId: number | null
}

export interface BoardProgress {
  bestScore: number
  highestTile: number
}

export interface SavedProgress {
  version: 1
  gamesPlayed: number
  boards: Record<BoardSize, BoardProgress>
}

export interface ScoreSummary {
  bestScore: number
  highestTile: number
  gamesPlayed: number
}

export function isBoardSize(value: unknown): value is BoardSize {
  return BOARD_SIZES.some((size) => size === value)
}

/** Stable object key for a board size; keeps persisted blobs from ever looking like a JSON list. */
export function boardSizeKey(size: BoardSize): string {
  return `size_${size}`
}
