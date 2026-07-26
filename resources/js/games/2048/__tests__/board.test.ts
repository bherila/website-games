import {
  boardFromValues,
  boardValues,
  createEmptyBoard,
  createStartingBoard,
  emptyCells,
  hasAvailableMove,
  highestTileValue,
  isGameOver,
  spawnTile,
  tileAt,
} from '../engine/board'
import { nextRandom, randomInt } from '../engine/rng'
import { BOARD_SIZES, STARTING_TILE_COUNT } from '../gameTypes'

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const first = nextRandom(1234)
    const second = nextRandom(1234)

    expect(first).toEqual(second)
    expect(first.value).toBeGreaterThanOrEqual(0)
    expect(first.value).toBeLessThan(1)
  })

  it('advances the seed so a chain of draws differs', () => {
    const first = nextRandom(7)
    const second = nextRandom(first.seed)

    expect(second.seed).not.toBe(first.seed)
    expect(second.value).not.toBe(first.value)
  })

  it('keeps randomInt inside the requested range', () => {
    let seed = 42
    for (let index = 0; index < 200; index += 1) {
      const draw = randomInt(seed, 5)
      seed = draw.seed
      expect(draw.value).toBeGreaterThanOrEqual(0)
      expect(draw.value).toBeLessThan(5)
    }
  })
})

describe('board', () => {
  it('starts empty with every cell available', () => {
    const board = createEmptyBoard(4)

    expect(board.tiles).toEqual([])
    expect(emptyCells(board)).toHaveLength(16)
    expect(highestTileValue(board)).toBe(0)
  })

  it('spawns a 2 or a 4 into an empty cell and advances the seed', () => {
    const spawn = spawnTile(createEmptyBoard(4), 99)

    expect(spawn.tile).not.toBeNull()
    expect([2, 4]).toContain(spawn.tile?.value)
    expect(spawn.board.tiles).toHaveLength(1)
    expect(spawn.board.nextTileId).toBe(2)
    expect(spawn.seed).not.toBe(99)
  })

  it('never spawns onto an occupied cell', () => {
    let board = boardFromValues([
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 0],
    ])
    const spawn = spawnTile(board, 5)
    board = spawn.board

    expect(spawn.tile).toMatchObject({ row: 2, column: 2 })
    expect(emptyCells(board)).toEqual([])
  })

  it('reports no spawn when the board is full', () => {
    const board = boardFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 512],
    ])
    const spawn = spawnTile(board, 5)

    expect(spawn.tile).toBeNull()
    expect(spawn.board).toBe(board)
  })

  it('spawns the same tiles for the same seed on every board size', () => {
    for (const size of BOARD_SIZES) {
      const first = createStartingBoard(size, 2024)
      const second = createStartingBoard(size, 2024)

      expect(first.board.tiles).toHaveLength(STARTING_TILE_COUNT)
      expect(boardValues(first.board)).toEqual(boardValues(second.board))
      expect(first.seed).toBe(second.seed)
    }
  })

  it('finds tiles by cell', () => {
    const board = boardFromValues([
      [0, 8, 0],
      [0, 0, 0],
      [0, 0, 0],
    ])

    expect(tileAt(board, 0, 1)?.value).toBe(8)
    expect(tileAt(board, 0, 0)).toBeNull()
    expect(tileAt(board, 9, 9)).toBeNull()
  })

  it('detects game over only when no slide and no merge remain', () => {
    const full = boardFromValues([
      [2, 4, 2],
      [4, 2, 4],
      [2, 4, 2],
    ])
    const mergeable = boardFromValues([
      [2, 2, 4],
      [4, 2, 4],
      [2, 4, 2],
    ])
    const gappy = boardFromValues([
      [2, 4, 0],
      [4, 2, 4],
      [2, 4, 2],
    ])

    expect(isGameOver(full)).toBe(true)
    expect(hasAvailableMove(full)).toBe(false)
    expect(isGameOver(mergeable)).toBe(false)
    expect(isGameOver(gappy)).toBe(false)
  })

  it('detects a vertical-only merge as playable', () => {
    const board = boardFromValues([
      [2, 4, 8],
      [2, 8, 4],
      [4, 4, 8],
    ])

    expect(hasAvailableMove(board)).toBe(true)
  })

  it('rejects fixture grids that are not a supported square size', () => {
    expect(() => boardFromValues([[2, 2]])).toThrow(/supported board size/)
    expect(() => boardFromValues([[2, 2, 0], [0, 0, 0]])).toThrow(/supported board size/)
  })
})
