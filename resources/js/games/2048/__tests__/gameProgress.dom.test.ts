import { definitionRowKey } from '../../_shared/gameDataPersistence'
import { boardFromValues, boardValues, highestTileValue } from '../engine/board'
import { markRunRecorded, performMove, startRun } from '../engine/gameRun'
import {
  bestScoreOverall,
  clearSavedRun,
  createInitialProgress,
  highestTileOverall,
  loadProgress,
  loadSavedRun,
  loadScoreSummary,
  parseSavedRun,
  recordBest,
  recordGameEnd,
  recordRunEnd,
  saveProgress,
  saveRun,
  TWENTY48_GAME_DATA,
  TWENTY48_SAVE_DATA,
} from '../gameProgress'
import type { GameRun } from '../gameTypes'
import { TWENTY48_PROGRESS_STORAGE_KEY, TWENTY48_SAVE_STORAGE_KEY } from '../gameTypes'

/** Minimal stand-in for the hydrated database row map handed to a codec. */
function rowsFor(scope: 'profile' | 'save', slot: string, data: Record<string, unknown>) {
  return new Map([[definitionRowKey(scope, slot), {
    game: '2048' as const,
    scope,
    slot,
    data,
    revision: 1,
    updatedAt: null,
  }]])
}

describe('2048 progress', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips anonymous progress', () => {
    const progress = recordGameEnd(createInitialProgress(), 4, 12480, 2048)
    saveProgress(progress)

    expect(loadProgress()).toEqual(progress)
  })

  it('tracks bests per board size', () => {
    let progress = recordGameEnd(createInitialProgress(), 4, 12480, 2048)
    progress = recordGameEnd(progress, 3, 900, 256)

    expect(progress.boards[4]).toEqual({ bestScore: 12480, highestTile: 2048 })
    expect(progress.boards[3]).toEqual({ bestScore: 900, highestTile: 256 })
    expect(progress.boards[5]).toEqual({ bestScore: 0, highestTile: 0 })
    expect(progress.gamesPlayed).toBe(2)
    expect(bestScoreOverall(progress)).toBe(12480)
    expect(highestTileOverall(progress)).toBe(2048)
  })

  it('never lowers a best and never rewrites an unchanged row', () => {
    const first = recordGameEnd(createInitialProgress(), 4, 5000, 512)
    const worse = recordBest(first, 4, 100, 8)

    expect(worse).toBe(first)
    expect(recordGameEnd(first, 4, 100, 8).boards[4]).toEqual({ bestScore: 5000, highestTile: 512 })
  })

  it('counts a game only when the run is retired', () => {
    const reachedWin = recordBest(createInitialProgress(), 4, 20000, 2048)

    expect(reachedWin.gamesPlayed).toBe(0)
    expect(recordGameEnd(reachedWin, 4, 20000, 2048).gamesPlayed).toBe(1)
  })

  it('retires a run from its own high-water marks, counting it exactly once', () => {
    const finished = markRunRecorded(performMove(startRun(4, 5150), 'left').run)
    const run: GameRun = { ...finished, recorded: false, bestScore: 700, bestTile: 128 }

    const counted = recordRunEnd(createInitialProgress(), run)
    expect(counted.gamesPlayed).toBe(1)
    expect(counted.boards[4]).toEqual({ bestScore: 700, highestTile: 128 })

    // The same physical run, revived by undo and retired again: its bests still
    // count, but the game does not.
    const again = recordRunEnd(counted, { ...run, recorded: true, bestScore: 900, bestTile: 256 })
    expect(again.gamesPlayed).toBe(1)
    expect(again.boards[4]).toEqual({ bestScore: 900, highestTile: 256 })
  })

  it('summarizes a first-time player without NaN or negative values', () => {
    expect(loadScoreSummary()).toEqual({ bestScore: 0, highestTile: 0, gamesPlayed: 0 })
  })

  it('falls back to defaults for malformed progress', () => {
    window.localStorage.setItem(TWENTY48_PROGRESS_STORAGE_KEY, '{bad json')
    expect(loadProgress()).toEqual(createInitialProgress())

    window.localStorage.setItem(TWENTY48_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 2, gamesPlayed: 3 }))
    expect(loadProgress()).toEqual(createInitialProgress())

    window.localStorage.setItem(TWENTY48_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      gamesPlayed: 2,
      boards: { 4: { bestScore: 'lots', highestTile: 2048 }, 5: { bestScore: 10, highestTile: 16 } },
    }))
    const loaded = loadProgress()
    expect(loaded.gamesPlayed).toBe(2)
    expect(loaded.boards[4]).toEqual({ bestScore: 0, highestTile: 0 })
    expect(loaded.boards[5]).toEqual({ bestScore: 10, highestTile: 16 })
  })

  it('encodes one profile row with size-keyed monotonic metrics', () => {
    const progress = recordGameEnd(recordGameEnd(createInitialProgress(), 4, 12480, 2048), 6, 300, 64)

    expect(TWENTY48_GAME_DATA.encode(progress)).toEqual([{
      scope: 'profile',
      slot: 'default',
      data: {
        version: 1,
        games_played: 2,
        high_score: 12480,
        highest_tile: 2048,
        boards: {
          size_3: { best_score: 0, highest_tile: 0 },
          size_4: { best_score: 12480, highest_tile: 2048 },
          size_5: { best_score: 0, highest_tile: 0 },
          size_6: { best_score: 300, highest_tile: 64 },
        },
      },
    }])
  })

  it('decodes a profile row, and ignores rows from another version', () => {
    const decoded = TWENTY48_GAME_DATA.decode(rowsFor('profile', 'default', {
      version: 1,
      games_played: 7,
      boards: { size_4: { best_score: 4096, highest_tile: 512 } },
    }))

    expect(decoded).toEqual({
      version: 1,
      gamesPlayed: 7,
      boards: {
        3: { bestScore: 0, highestTile: 0 },
        4: { bestScore: 4096, highestTile: 512 },
        5: { bestScore: 0, highestTile: 0 },
        6: { bestScore: 0, highestTile: 0 },
      },
    })
    expect(TWENTY48_GAME_DATA.decode(rowsFor('profile', 'default', { version: 9 }))).toBeNull()
    expect(TWENTY48_GAME_DATA.decode(new Map())).toBeNull()
  })
})

describe('2048 saved runs', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips a live run through browser storage', () => {
    let run = startRun(5, 4321)
    run = performMove(run, 'left').run
    run = performMove(run, 'up').run
    saveRun(run)

    const restored = loadSavedRun()
    expect(restored).toEqual(run)
    expect(restored?.history).toHaveLength(run.history.length)
  })

  it('restores score, undo allowance, and the win latch exactly', () => {
    const run: GameRun = {
      version: 1,
      // `nextTileId` is raised past what `boardFromValues` derives from the tile
      // count: a real run has already issued ids for the tiles the merge in the
      // history snapshot consumed, and the parser insists on that ordering.
      board: { ...boardFromValues([[2048, 4, 0], [0, 8, 0], [0, 0, 16]]), nextTileId: 7 },
      score: 20124,
      bestScore: 20124,
      bestTile: 2048,
      recorded: false,
      status: 'playing',
      randomSeed: 99,
      undosRemaining: 1,
      history: [{ board: boardFromValues([[1024, 4, 0], [1024, 8, 0], [0, 0, 16]]), score: 18076, randomSeed: 55 }],
      reachedWinningTile: true,
      moves: 412,
    }
    saveRun(run)

    const restored = loadSavedRun()
    expect(restored?.score).toBe(20124)
    expect(restored?.undosRemaining).toBe(1)
    expect(restored?.reachedWinningTile).toBe(true)
    expect(restored?.moves).toBe(412)
    expect(boardValues(restored?.history[0]?.board ?? boardFromValues([[0, 0, 0], [0, 0, 0], [0, 0, 0]])))
      .toEqual([[1024, 4, 0], [1024, 8, 0], [0, 0, 16]])
  })

  it('clears the save row', () => {
    saveRun(startRun(4, 1))
    clearSavedRun()

    expect(loadSavedRun()).toBeNull()
    expect(window.localStorage.getItem(TWENTY48_SAVE_STORAGE_KEY)).toBeNull()
  })

  it('rejects malformed saves instead of resuming an impossible board', () => {
    const valid = startRun(4, 2)
    const encoded = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>

    expect(parseSavedRun(encoded)).not.toBeNull()
    expect(parseSavedRun('{}')).toBeNull()
    expect(parseSavedRun(null)).toBeNull()
    expect(parseSavedRun({ ...encoded, version: 2 })).toBeNull()
    expect(parseSavedRun({ ...encoded, status: 'paused' })).toBeNull()
    expect(parseSavedRun({ ...encoded, score: -5 })).toBeNull()
    expect(parseSavedRun({ ...encoded, undosRemaining: 9 })).toBeNull()
    expect(parseSavedRun({ ...encoded, board: { size: 7, nextTileId: 1, tiles: [] } })).toBeNull()
    expect(parseSavedRun({
      ...encoded,
      board: { size: 4, nextTileId: 3, tiles: [{ id: 1, value: 2, row: 0, column: 0 }, { id: 2, value: 4, row: 0, column: 0 }] },
    })).toBeNull()
    expect(parseSavedRun({
      ...encoded,
      board: { size: 4, nextTileId: 2, tiles: [{ id: 1, value: 2, row: 9, column: 0 }] },
    })).toBeNull()
    expect(parseSavedRun({
      ...encoded,
      board: { size: 4, nextTileId: 2, tiles: [{ id: 1, value: 6, row: 0, column: 0 }] },
    })).toBeNull()
    expect(parseSavedRun({
      ...encoded,
      history: [{ board: { size: 4, nextTileId: 1, tiles: [] }, score: 'nope', randomSeed: 1 }],
    })).toBeNull()
  })

  it('rejects history snapshots that do not belong to the run', () => {
    const run = performMove(startRun(4, 808), 'left').run
    const encoded = JSON.parse(JSON.stringify(run)) as Record<string, unknown>
    const snapshot = run.history[0]

    expect(parseSavedRun(encoded)).not.toBeNull()
    // A 3x3 snapshot inside a 4x4 run would swap the board size on undo.
    expect(parseSavedRun({
      ...encoded,
      history: [{ ...snapshot, board: boardFromValues([[2, 0, 0], [0, 4, 0], [0, 0, 0]]) }],
    })).toBeNull()
    // Tile ids the run has not issued yet cannot have existed before it.
    expect(parseSavedRun({
      ...encoded,
      history: [{ ...snapshot, board: { ...snapshot?.board, nextTileId: run.board.nextTileId + 1 } }],
    })).toBeNull()
  })

  it('degrades a save written before the run high-water marks existed', () => {
    const run = performMove({
      version: 1,
      board: boardFromValues([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]),
      score: 0,
      bestScore: 0,
      bestTile: 2,
      recorded: false,
      status: 'playing',
      randomSeed: 4104,
      undosRemaining: 3,
      history: [],
      reachedWinningTile: false,
      moves: 0,
    }, 'left').run
    const legacy = JSON.parse(JSON.stringify(run)) as Record<string, unknown>
    delete legacy.bestScore
    delete legacy.bestTile
    delete legacy.recorded

    const restored = parseSavedRun(legacy)
    expect(restored?.bestScore).toBe(run.score)
    expect(restored?.bestTile).toBe(highestTileValue(run.board))
    expect(restored?.recorded).toBe(false)

    // A high-water mark below the live score, or a malformed one, is corruption.
    expect(parseSavedRun({ ...legacy, bestScore: run.score - 2 })?.bestScore).toBe(run.score)
    expect(parseSavedRun({ ...legacy, bestScore: 'plenty' })).toBeNull()
    expect(parseSavedRun({ ...legacy, bestTile: -8 })).toBeNull()
  })

  it('rejects a finished board so a dead game never resumes', () => {
    const dead = {
      version: 1,
      board: boardFromValues([
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ]),
      score: 100,
      status: 'playing',
      randomSeed: 3,
      undosRemaining: 0,
      history: [],
      reachedWinningTile: false,
      moves: 40,
    }

    expect(parseSavedRun(JSON.parse(JSON.stringify(dead)))).toBeNull()
  })

  it('encodes and decodes the database save row in snake_case', () => {
    const run = performMove(startRun(4, 606), 'left').run
    const encoded = TWENTY48_SAVE_DATA.encode(run)
    const slot = encoded[0]

    expect(slot?.scope).toBe('save')
    expect(slot?.slot).toBe('autosave')
    expect(slot?.data).toMatchObject({ version: 1, score: run.score, random_seed: run.randomSeed })
    expect(TWENTY48_SAVE_DATA.decode(rowsFor('save', 'autosave', slot?.data ?? {}))).toEqual(run)
    expect(TWENTY48_SAVE_DATA.clearSlots).toEqual([{ scope: 'save', slot: 'autosave' }])
  })
})
