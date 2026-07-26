import type { Board, BoardSize, Tile } from '../gameTypes'
import { isBoardSize, SPAWN_FOUR_PROBABILITY, STARTING_TILE_COUNT } from '../gameTypes'
import { nextRandom, randomInt } from './rng'

export interface Cell {
  row: number
  column: number
}

export function createEmptyBoard(size: BoardSize): Board {
  return { size, tiles: [], nextTileId: 1 }
}

export function tileAt(board: Board, row: number, column: number): Tile | null {
  return board.tiles.find((tile) => tile.row === row && tile.column === column) ?? null
}

export function emptyCells(board: Board): Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < board.size; row += 1) {
    for (let column = 0; column < board.size; column += 1) {
      if (!tileAt(board, row, column)) {
        cells.push({ row, column })
      }
    }
  }

  return cells
}

export interface SpawnResult {
  board: Board
  seed: number
  tile: Tile | null
}

/** Adds one 2 (or, 10% of the time, one 4) to a random empty cell. */
export function spawnTile(board: Board, seed: number): SpawnResult {
  const cells = emptyCells(board)
  if (cells.length === 0) {
    return { board, seed, tile: null }
  }

  const cellDraw = randomInt(seed, cells.length)
  const cell = cells[cellDraw.value]
  if (!cell) {
    return { board, seed: cellDraw.seed, tile: null }
  }

  const valueDraw = nextRandom(cellDraw.seed)
  const tile: Tile = {
    id: board.nextTileId,
    value: valueDraw.value < SPAWN_FOUR_PROBABILITY ? 4 : 2,
    row: cell.row,
    column: cell.column,
  }

  return {
    board: { size: board.size, tiles: [...board.tiles, tile], nextTileId: board.nextTileId + 1 },
    seed: valueDraw.seed,
    tile,
  }
}

/** A fresh board with the classic two starting tiles. */
export function createStartingBoard(size: BoardSize, seed: number): { board: Board, seed: number } {
  let board = createEmptyBoard(size)
  let currentSeed = seed
  for (let index = 0; index < STARTING_TILE_COUNT; index += 1) {
    const spawn = spawnTile(board, currentSeed)
    board = spawn.board
    currentSeed = spawn.seed
  }

  return { board, seed: currentSeed }
}

export function highestTileValue(board: Board): number {
  return board.tiles.reduce((highest, tile) => Math.max(highest, tile.value), 0)
}

/** True while any slide or merge is still possible. */
export function hasAvailableMove(board: Board): boolean {
  if (board.tiles.length < board.size * board.size) {
    return true
  }

  for (let row = 0; row < board.size; row += 1) {
    for (let column = 0; column < board.size; column += 1) {
      const tile = tileAt(board, row, column)
      if (!tile) {
        return true
      }
      const right = tileAt(board, row, column + 1)
      const down = tileAt(board, row + 1, column)
      if (right?.value === tile.value || down?.value === tile.value) {
        return true
      }
    }
  }

  return false
}

export function isGameOver(board: Board): boolean {
  return !hasAvailableMove(board)
}

/** Row-major value grid (0 = empty). Used by the renderer's tests and fixtures. */
export function boardValues(board: Board): number[][] {
  return Array.from({ length: board.size }, (_unused, row) => (
    Array.from({ length: board.size }, (_unusedColumn, column) => tileAt(board, row, column)?.value ?? 0)
  ))
}

/**
 * Builds a board from a value grid (0 = empty). Tile ids are assigned in
 * reading order, which makes fixtures and expectations easy to write.
 */
export function boardFromValues(values: readonly (readonly number[])[]): Board {
  const size = values.length
  if (!isBoardSize(size) || values.some((row) => row.length !== size)) {
    throw new Error('boardFromValues requires a square grid of a supported board size.')
  }

  const tiles: Tile[] = []
  values.forEach((rowValues, row) => {
    rowValues.forEach((value, column) => {
      if (value > 0) {
        tiles.push({ id: tiles.length + 1, value, row, column })
      }
    })
  })

  return { size, tiles, nextTileId: tiles.length + 1 }
}
