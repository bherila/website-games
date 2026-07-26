import type { Board, BoardSize, Direction, GameRun, MoveApplication, RunSnapshot, RunStatus } from '../gameTypes'
import { MAX_UNDOS_PER_RUN, WINNING_TILE_VALUE } from '../gameTypes'
import { applyMove } from './applyMove'
import { createStartingBoard, hasAvailableMove, highestTileValue, spawnTile } from './board'

function statusForBoard(board: Board): RunStatus {
  return hasAvailableMove(board) ? 'playing' : 'over'
}

export function startRun(size: BoardSize, seed: number): GameRun {
  const started = createStartingBoard(size, seed)

  return {
    version: 1,
    board: started.board,
    score: 0,
    bestScore: 0,
    bestTile: highestTileValue(started.board),
    recorded: false,
    status: 'playing',
    randomSeed: started.seed,
    undosRemaining: MAX_UNDOS_PER_RUN,
    history: [],
    reachedWinningTile: false,
    moves: 0,
  }
}

/**
 * Latches the run as counted towards games played. Idempotent, so a revived run
 * that ends again is never counted twice.
 */
export function markRunRecorded(run: GameRun): GameRun {
  return run.recorded ? run : { ...run, recorded: true }
}

export function canUndo(run: GameRun): boolean {
  return run.undosRemaining > 0 && run.history.length > 0
}

/**
 * Applies one swipe. A move that changes nothing (or arrives while an overlay
 * owns the run) is reported as `changed: false` and leaves the run — including
 * its undo history — untouched.
 */
export function performMove(run: GameRun, direction: Direction): MoveApplication {
  if (run.status !== 'playing') {
    return { run, changed: false, outcome: null, spawnedTileId: null }
  }

  const outcome = applyMove(run.board, direction)
  if (!outcome.moved) {
    return { run, changed: false, outcome: null, spawnedTileId: null }
  }

  const spawn = spawnTile(outcome.board, run.randomSeed)
  const snapshot: RunSnapshot = { board: run.board, score: run.score, randomSeed: run.randomSeed }
  const highestTile = highestTileValue(spawn.board)
  const reachedWinningTile = run.reachedWinningTile || highestTile >= WINNING_TILE_VALUE
  const justWon = reachedWinningTile && !run.reachedWinningTile
  const score = run.score + outcome.gained

  return {
    run: {
      version: 1,
      board: spawn.board,
      score,
      bestScore: Math.max(run.bestScore, score),
      bestTile: Math.max(run.bestTile, highestTile),
      recorded: run.recorded,
      status: justWon ? 'won' : statusForBoard(spawn.board),
      randomSeed: spawn.seed,
      undosRemaining: run.undosRemaining,
      // Only the last few boards are retained: undo is capped per run, so
      // deeper history could never be reached and would bloat the save row.
      history: [snapshot, ...run.history].slice(0, MAX_UNDOS_PER_RUN),
      reachedWinningTile,
      moves: run.moves + 1,
    },
    changed: true,
    outcome,
    spawnedTileId: spawn.tile?.id ?? null,
  }
}

/**
 * Rewinds one move and spends an undo. Undo also revives a finished run, which
 * is the point of having it: a fatal last move can be taken back.
 */
export function undoMove(run: GameRun): GameRun {
  const [snapshot, ...history] = run.history
  if (!canUndo(run) || !snapshot) {
    return run
  }

  return {
    version: 1,
    board: snapshot.board,
    score: snapshot.score,
    // High-water marks and the counted latch survive the rewind: the run really
    // did reach that score, and it is still the same physical run.
    bestScore: run.bestScore,
    bestTile: run.bestTile,
    recorded: run.recorded,
    // A rewound board always has a legal move (it had one when it was played),
    // and the win latch stays set so "keep going" is never re-prompted.
    status: 'playing',
    randomSeed: snapshot.randomSeed,
    undosRemaining: run.undosRemaining - 1,
    history,
    reachedWinningTile: run.reachedWinningTile,
    moves: Math.max(0, run.moves - 1),
  }
}

/** Dismisses the win overlay and resumes the same run. */
export function continueAfterWin(run: GameRun): GameRun {
  if (run.status !== 'won') {
    return run
  }

  return { ...run, status: statusForBoard(run.board) }
}
