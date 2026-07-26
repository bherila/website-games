import { defineGameData, definitionRowKey, gameDataStorage } from '../_shared/gameDataPersistence'
import { isRecord, parseArray, parseInteger } from '../_shared/progressParsers'
import { hasAvailableMove, highestTileValue } from './engine/board'
import type {
  Board,
  BoardProgress,
  BoardSize,
  GameRun,
  RunSnapshot,
  RunStatus,
  SavedProgress,
  ScoreSummary,
  Tile,
} from './gameTypes'
import {
  BOARD_SIZES,
  boardSizeKey,
  isBoardSize,
  MAX_UNDOS_PER_RUN,
  TWENTY48_PROGRESS_STORAGE_KEY,
  TWENTY48_SAVE_STORAGE_KEY,
} from './gameTypes'

export function createInitialProgress(): SavedProgress {
  return {
    version: 1,
    gamesPlayed: 0,
    boards: { 3: emptyBoardProgress(), 4: emptyBoardProgress(), 5: emptyBoardProgress(), 6: emptyBoardProgress() },
  }
}

function emptyBoardProgress(): BoardProgress {
  return { bestScore: 0, highestTile: 0 }
}

/**
 * `profile/default` codec. Per-board-size bests live in a nested object keyed
 * `size_3`…`size_6` (never numeric keys, which JSON round-tripping could turn
 * into a list) whose leaf metric names — `best_score`, `highest_tile` — are
 * reconciled as maximums by `GameDataMerger`, so a stale device can never lower
 * a best. `games_played` is likewise monotonic rather than additive: two
 * devices reporting 5 games settle on 5, not 10.
 */
export const TWENTY48_GAME_DATA = defineGameData<SavedProgress>({
  game: '2048',
  localStorageKey: TWENTY48_PROGRESS_STORAGE_KEY,
  parse: parseSavedProgress,
  encode: (progress) => [{
    scope: 'profile',
    slot: 'default',
    data: {
      version: 1,
      games_played: progress.gamesPlayed,
      high_score: bestScoreOverall(progress),
      highest_tile: highestTileOverall(progress),
      boards: Object.fromEntries(BOARD_SIZES.map((size) => [boardSizeKey(size), {
        best_score: progress.boards[size].bestScore,
        highest_tile: progress.boards[size].highestTile,
      }])),
    },
  }],
  decode: (rows) => {
    const row = rows.get(definitionRowKey('profile', 'default'))
    if (row?.data.version !== 1) {
      return null
    }

    const boards = isRecord(row.data.boards) ? row.data.boards : {}
    const progress = createInitialProgress()
    progress.gamesPlayed = parseInteger(row.data.games_played, 0) ?? 0
    for (const size of BOARD_SIZES) {
      const entry = boards[boardSizeKey(size)]
      if (!isRecord(entry)) {
        continue
      }
      progress.boards[size] = {
        bestScore: parseInteger(entry.best_score, 0) ?? 0,
        highestTile: parseInteger(entry.highest_tile, 0) ?? 0,
      }
    }

    return progress
  },
})

/**
 * `save/autosave` codec: the entire live run, so a reload resumes the exact
 * board, score, win latch, and remaining undo history.
 */
export const TWENTY48_SAVE_DATA = defineGameData<GameRun>({
  game: '2048',
  localStorageKey: TWENTY48_SAVE_STORAGE_KEY,
  parse: parseSavedRun,
  encode: (run) => [{ scope: 'save', slot: 'autosave', data: encodeRun(run) }],
  decode: (rows) => parseSavedRun(rows.get(definitionRowKey('save', 'autosave'))?.data),
  clearSlots: [{ scope: 'save', slot: 'autosave' }],
})

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): SavedProgress {
  try {
    const raw = storage?.getItem(TWENTY48_PROGRESS_STORAGE_KEY)

    return raw ? parseSavedProgress(JSON.parse(raw)) ?? createInitialProgress() : createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

export function saveProgress(progress: SavedProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  try {
    storage?.setItem(TWENTY48_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Losing a best score must never interrupt play.
  }
}

/** Monotonically raises the bests for one board size. Does not count a game. */
export function recordBest(progress: SavedProgress, size: BoardSize, score: number, highestTile: number): SavedProgress {
  const current = progress.boards[size]
  const next: BoardProgress = {
    bestScore: Math.max(current.bestScore, Math.max(0, Math.floor(score))),
    highestTile: Math.max(current.highestTile, Math.max(0, Math.floor(highestTile))),
  }
  if (next.bestScore === current.bestScore && next.highestTile === current.highestTile) {
    return progress
  }

  return { ...progress, boards: { ...progress.boards, [size]: next } }
}

/** Retires a run: raises its bests and counts it towards games played. */
export function recordGameEnd(progress: SavedProgress, size: BoardSize, score: number, highestTile: number): SavedProgress {
  const withBest = recordBest(progress, size, score, highestTile)

  return { ...withBest, gamesPlayed: withBest.gamesPlayed + 1 }
}

/**
 * Retires one run from its own high-water marks. A run already counted — undo
 * revived it and it ended, or was abandoned, a second time — still contributes
 * its bests but is never counted again, so one physical run is one game played.
 */
export function recordRunEnd(progress: SavedProgress, run: GameRun): SavedProgress {
  const size = run.board.size

  return run.recorded
    ? recordBest(progress, size, run.bestScore, run.bestTile)
    : recordGameEnd(progress, size, run.bestScore, run.bestTile)
}

export function bestScoreOverall(progress: SavedProgress): number {
  return BOARD_SIZES.reduce((best, size) => Math.max(best, progress.boards[size].bestScore), 0)
}

export function highestTileOverall(progress: SavedProgress): number {
  return BOARD_SIZES.reduce((best, size) => Math.max(best, progress.boards[size].highestTile), 0)
}

/** Card summary for the Game Select catalog. */
export function loadScoreSummary(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): ScoreSummary {
  const progress = loadProgress(storage)

  return {
    bestScore: bestScoreOverall(progress),
    highestTile: highestTileOverall(progress),
    gamesPlayed: progress.gamesPlayed,
  }
}

export function saveRun(run: GameRun, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  try {
    storage?.setItem(TWENTY48_SAVE_STORAGE_KEY, JSON.stringify(run))
  } catch {
    // Autosave is best-effort; the run stays playable in memory.
  }
}

export function loadSavedRun(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): GameRun | null {
  try {
    const raw = storage?.getItem(TWENTY48_SAVE_STORAGE_KEY)

    return raw ? parseSavedRun(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function clearSavedRun(storage: Pick<Storage, 'removeItem'> | null = gameDataStorage()): void {
  try {
    storage?.removeItem(TWENTY48_SAVE_STORAGE_KEY)
  } catch {
    // Nothing to recover from: the next successful write replaces the row.
  }
}

export function parseSavedProgress(value: unknown): SavedProgress | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const gamesPlayed = parseInteger(value.gamesPlayed, 0)
  if (gamesPlayed === null || !isRecord(value.boards)) {
    return null
  }

  const progress = createInitialProgress()
  progress.gamesPlayed = gamesPlayed
  for (const size of BOARD_SIZES) {
    const entry = value.boards[size]
    if (!isRecord(entry)) {
      continue
    }
    const bestScore = parseInteger(entry.bestScore, 0)
    const highestTile = parseInteger(entry.highestTile, 0)
    if (bestScore === null || highestTile === null) {
      continue
    }
    progress.boards[size] = { bestScore, highestTile }
  }

  return progress
}

function encodeRun(run: GameRun): Record<string, unknown> {
  return {
    version: 1,
    board: encodeBoard(run.board),
    score: run.score,
    best_score: run.bestScore,
    best_tile: run.bestTile,
    recorded: run.recorded,
    status: run.status,
    random_seed: run.randomSeed,
    undos_remaining: run.undosRemaining,
    reached_winning_tile: run.reachedWinningTile,
    moves: run.moves,
    history: run.history.map((snapshot) => ({
      board: encodeBoard(snapshot.board),
      score: snapshot.score,
      random_seed: snapshot.randomSeed,
    })),
  }
}

function encodeBoard(board: Board): Record<string, unknown> {
  return {
    size: board.size,
    next_tile_id: board.nextTileId,
    tiles: board.tiles.map((tile) => ({ id: tile.id, value: tile.value, row: tile.row, column: tile.column })),
  }
}

/**
 * Defensive save parser. Anything structurally impossible — a bad size, an
 * off-board or duplicated tile, a non power-of-two value, a finished board, a
 * history snapshot from a different run — is rejected wholesale so a corrupt row
 * starts a clean game instead of rendering an unplayable one.
 *
 * The run's high-water marks and its counted latch were added after the first
 * saves shipped: a blob without them keeps the same `version: 1` and degrades to
 * the live score, the tiles on the board, and "not yet counted".
 */
export function parseSavedRun(value: unknown): GameRun | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const board = parseBoard(value.board)
  const score = parseInteger(value.score, 0)
  const randomSeed = parseInteger(readSnake(value, 'randomSeed'), 0)
  const undosRemaining = parseInteger(readSnake(value, 'undosRemaining'), 0)
  const moves = parseInteger(value.moves, 0)
  const status = parseStatus(value.status)
  const history = parseArray(value.history, parseSnapshot)

  if (
    board === null
    || score === null
    || randomSeed === null
    || undosRemaining === null
    || undosRemaining > MAX_UNDOS_PER_RUN
    || moves === null
    || status === null
    || history === null
    || history.length > MAX_UNDOS_PER_RUN
    || !hasAvailableMove(board)
    || !history.every((snapshot) => isSnapshotOfRun(snapshot, board))
  ) {
    return null
  }

  const highestTile = highestTileValue(board)
  const bestScore = parseAddedInteger(readSnake(value, 'bestScore'), score)
  const bestTile = parseAddedInteger(readSnake(value, 'bestTile'), highestTile)
  if (bestScore === null || bestTile === null) {
    return null
  }

  return {
    version: 1,
    board,
    score,
    // A high-water mark can never be below what the run is showing right now.
    bestScore: Math.max(bestScore, score),
    bestTile: Math.max(bestTile, highestTile),
    recorded: readSnake(value, 'recorded') === true,
    status: status === 'over' ? 'playing' : status,
    randomSeed,
    undosRemaining,
    history,
    reachedWinningTile: readSnake(value, 'reachedWinningTile') === true,
    moves,
  }
}

function parseSnapshot(value: unknown): RunSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const board = parseBoard(value.board)
  const score = parseInteger(value.score, 0)
  const randomSeed = parseInteger(readSnake(value, 'randomSeed'), 0)
  if (board === null || score === null || randomSeed === null) {
    return null
  }

  return { board, score, randomSeed }
}

/**
 * Reads a field that older saves predate: absent falls back, but a present and
 * malformed value is corruption like any other and rejects the whole row.
 */
function parseAddedInteger(value: unknown, fallback: number): number | null {
  return value === undefined ? fallback : parseInteger(value, 0)
}

/**
 * A snapshot has to be an earlier state of *this* run: same board size, and no
 * tile ids the run has not issued yet. Validating each snapshot in isolation
 * would let a tampered blob hide a 3×3 board inside a 4×4 run, so pressing
 * Undo would swap the board size mid-run.
 */
function isSnapshotOfRun(snapshot: RunSnapshot, board: Board): boolean {
  return snapshot.board.size === board.size && snapshot.board.nextTileId <= board.nextTileId
}

function parseBoard(value: unknown): Board | null {
  if (!isRecord(value)) {
    return null
  }

  const size = value.size
  const nextTileId = parseInteger(readSnake(value, 'nextTileId'), 1)
  const tiles = parseArray(value.tiles, parseTile)
  if (!isBoardSize(size) || nextTileId === null || tiles === null || tiles.length > size * size) {
    return null
  }

  const occupied = new Set<string>()
  const ids = new Set<number>()
  for (const tile of tiles) {
    if (tile.row >= size || tile.column >= size || tile.id >= nextTileId) {
      return null
    }
    const cell = `${tile.row}:${tile.column}`
    if (occupied.has(cell) || ids.has(tile.id)) {
      return null
    }
    occupied.add(cell)
    ids.add(tile.id)
  }

  return { size, tiles, nextTileId }
}

function parseTile(value: unknown): Tile | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseInteger(value.id, 1)
  const tileValue = parseInteger(value.value, 2)
  const row = parseInteger(value.row, 0)
  const column = parseInteger(value.column, 0)
  if (id === null || tileValue === null || row === null || column === null || !isPowerOfTwo(tileValue)) {
    return null
  }

  return { id, value: tileValue, row, column }
}

function parseStatus(value: unknown): RunStatus | null {
  return value === 'playing' || value === 'won' || value === 'over' ? value : null
}

function isPowerOfTwo(value: number): boolean {
  return value >= 2 && (value & (value - 1)) === 0
}

/**
 * Reads a field that is camelCase in browser storage and snake_case in the
 * database row, so both shapes decode through one parser.
 */
function readSnake(value: Record<string, unknown>, camelKey: string): unknown {
  const snakeKey = camelKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

  return value[camelKey] ?? value[snakeKey]
}
