import { boardFromValues, boardValues, highestTileValue } from '../engine/board'
import { canUndo, continueAfterWin, markRunRecorded, performMove, startRun, undoMove } from '../engine/gameRun'
import type { GameRun } from '../gameTypes'
import { MAX_UNDOS_PER_RUN, STARTING_TILE_COUNT } from '../gameTypes'

function runWith(values: readonly (readonly number[])[], overrides: Partial<GameRun> = {}): GameRun {
  const board = boardFromValues(values)
  const run: GameRun = {
    version: 1,
    board,
    score: 0,
    bestScore: 0,
    bestTile: highestTileValue(board),
    recorded: false,
    status: 'playing',
    randomSeed: 11,
    undosRemaining: MAX_UNDOS_PER_RUN,
    history: [],
    reachedWinningTile: false,
    moves: 0,
    ...overrides,
  }

  // A high-water mark is never below the live score of the run it describes.
  return { ...run, bestScore: Math.max(run.bestScore, run.score) }
}

describe('startRun', () => {
  it('deals two tiles, a full undo allowance, and no history', () => {
    const run = startRun(4, 77)

    expect(run.board.tiles).toHaveLength(STARTING_TILE_COUNT)
    expect(run.score).toBe(0)
    expect(run.status).toBe('playing')
    expect(run.undosRemaining).toBe(MAX_UNDOS_PER_RUN)
    expect(run.history).toEqual([])
    expect(run.moves).toBe(0)
  })

  it('is reproducible for a seed', () => {
    expect(boardValues(startRun(5, 90).board)).toEqual(boardValues(startRun(5, 90).board))
  })
})

describe('performMove', () => {
  it('scores the move, spawns one tile, and records history', () => {
    const application = performMove(runWith([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')

    expect(application.changed).toBe(true)
    expect(application.run.score).toBe(4)
    expect(application.run.moves).toBe(1)
    expect(application.run.board.tiles).toHaveLength(2)
    expect(application.spawnedTileId).toBe(application.run.board.nextTileId - 1)
    expect(application.run.history).toHaveLength(1)
    expect(application.run.history[0]?.score).toBe(0)
  })

  it('raises the run high-water marks and carries the counted latch', () => {
    const application = performMove(runWith([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { score: 500, bestScore: 900, bestTile: 1024, recorded: true }), 'left')

    expect(application.run.score).toBe(2548)
    expect(application.run.bestScore).toBe(2548)
    expect(application.run.bestTile).toBe(2048)
    expect(application.run.recorded).toBe(true)
  })

  it('ignores a move that changes nothing and keeps the history untouched', () => {
    const run = runWith([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const application = performMove(run, 'left')

    expect(application.changed).toBe(false)
    expect(application.run).toBe(run)
    expect(application.outcome).toBeNull()
  })

  it('caps the retained history at the undo allowance', () => {
    let run = startRun(4, 4242)
    for (let index = 0; index < 12; index += 1) {
      const direction = index % 2 === 0 ? 'left' : 'up'
      run = performMove(run, direction).run
      run = performMove(run, index % 2 === 0 ? 'right' : 'down').run
    }

    expect(run.history.length).toBeLessThanOrEqual(MAX_UNDOS_PER_RUN)
  })

  it('flags the run as won the first time a 2048 tile appears, then never again', () => {
    const won = performMove(runWith([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')

    expect(won.run.status).toBe('won')
    expect(won.run.reachedWinningTile).toBe(true)

    const resumed = continueAfterWin(won.run)
    expect(resumed.status).toBe('playing')

    const secondWin = performMove(runWith([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { reachedWinningTile: true }), 'left')

    expect(secondWin.run.status).toBe('playing')
  })

  it('ends the run when the spawned tile fills the last cell with no merge left', () => {
    // The freed cell ends up surrounded by 8 and 16, so neither a spawned 2 nor
    // a spawned 4 can leave a merge behind.
    const application = performMove(runWith([
      [0, 8, 16, 8],
      [16, 2, 4, 16],
      [8, 4, 2, 4],
      [16, 2, 4, 2],
    ]), 'left')

    expect(application.changed).toBe(true)
    expect(application.run.status).toBe('over')
  })

  it('refuses moves while an overlay owns the run', () => {
    const run = runWith([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { status: 'won' })

    expect(performMove(run, 'left').changed).toBe(false)
  })
})

describe('undoMove', () => {
  it('restores the exact board, score, and rng position and spends one undo', () => {
    const run = runWith([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const moved = performMove(run, 'left').run
    const undone = undoMove(moved)

    expect(boardValues(undone.board)).toEqual(boardValues(run.board))
    expect(undone.score).toBe(0)
    expect(undone.randomSeed).toBe(run.randomSeed)
    expect(undone.undosRemaining).toBe(MAX_UNDOS_PER_RUN - 1)
    expect(undone.moves).toBe(0)
    expect(undone.history).toEqual([])
  })

  it('stops after three undos in one run', () => {
    let run = startRun(4, 909)
    const directions = ['left', 'up', 'right', 'down', 'left', 'up'] as const
    for (const direction of directions) {
      run = performMove(run, direction).run
    }

    let undos = 0
    while (canUndo(run)) {
      run = undoMove(run)
      undos += 1
    }

    expect(undos).toBe(MAX_UNDOS_PER_RUN)
    expect(run.undosRemaining).toBe(0)
    expect(undoMove(run)).toBe(run)
  })

  it('revives a finished run and keeps the win latch', () => {
    const finished = performMove(runWith([
      [0, 8, 16, 8],
      [16, 2, 4, 16],
      [8, 4, 2, 4],
      [16, 2, 4, 2],
    ], { reachedWinningTile: true }), 'left')

    expect(finished.run.status).toBe('over')

    const undone = undoMove(finished.run)
    expect(undone.status).toBe('playing')
    expect(undone.reachedWinningTile).toBe(true)
  })

  it('keeps the high-water marks and the counted latch of the run it rewinds', () => {
    const moved = performMove(runWith([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], { score: 1000 }), 'left')
    const revived = undoMove(markRunRecorded(moved.run))

    expect(revived.score).toBe(1000)
    expect(revived.bestScore).toBe(3048)
    expect(revived.bestTile).toBe(2048)
    expect(highestTileValue(revived.board)).toBe(1024)
    expect(revived.recorded).toBe(true)
  })

  it('does nothing without history', () => {
    const run = startRun(3, 5)

    expect(canUndo(run)).toBe(false)
    expect(undoMove(run)).toBe(run)
  })
})

describe('markRunRecorded', () => {
  it('latches once and then returns the same run', () => {
    const run = startRun(4, 31)
    const recorded = markRunRecorded(run)

    expect(run.recorded).toBe(false)
    expect(recorded.recorded).toBe(true)
    expect(markRunRecorded(recorded)).toBe(recorded)
  })
})

describe('continueAfterWin', () => {
  it('leaves a run that is not showing the win overlay alone', () => {
    const run = startRun(4, 1)

    expect(continueAfterWin(run)).toBe(run)
  })

  it('goes straight to game over when the winning move also filled the board', () => {
    const run = runWith([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ], { status: 'won', reachedWinningTile: true })

    expect(continueAfterWin(run).status).toBe('over')
  })
})
