import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'

import { boardFromValues, boardValues, highestTileValue } from '../engine/board'
import { performMove, startRun } from '../engine/gameRun'
import { Game2048 } from '../Game2048'
import { loadProgress, loadSavedRun, saveRun } from '../gameProgress'
import type { Board, GameRun } from '../gameTypes'
import { TWENTY48_MUTED_STORAGE_KEY } from '../gameTypes'

const SEED = 20482048

/** A board whose only legal move fills the last cell with nothing left to merge. */
const DEAD_END_VALUES = [
  [0, 8, 16, 8],
  [16, 2, 4, 16],
  [8, 4, 2, 4],
  [16, 2, 4, 2],
]

function renderGame(): ReturnType<typeof render> {
  return render(<Game2048 initialSeed={SEED} />)
}

/** The tiles currently on screen, read back as a value grid. */
function renderedValues(size: number): number[][] {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
  for (const element of screen.getAllByTestId(/^tile-/)) {
    const row = Number(element.dataset.row)
    const column = Number(element.dataset.column)
    const line = grid[row]
    if (line) {
      line[column] = Number(element.dataset.value)
    }
  }

  return grid
}

function runFrom(board: Board, overrides: Partial<GameRun> = {}): GameRun {
  const run: GameRun = {
    version: 1,
    board,
    score: 0,
    bestScore: 0,
    bestTile: highestTileValue(board),
    recorded: false,
    status: 'playing',
    randomSeed: 5,
    undosRemaining: 3,
    history: [],
    reachedWinningTile: false,
    moves: 1,
    ...overrides,
  }

  // A high-water mark is never below the live score of the run it describes.
  return { ...run, bestScore: Math.max(run.bestScore, run.score) }
}

function swipe(dx: number, dy: number): void {
  const board = screen.getByTestId('board')
  fireEvent.pointerDown(board, { pointerId: 1, isPrimary: true, clientX: 120, clientY: 120 })
  fireEvent.pointerMove(board, { pointerId: 1, clientX: 120 + dx, clientY: 120 + dy })
  fireEvent.pointerUp(board, { pointerId: 1 })
}

type PointerKind = 'pointerDown' | 'pointerMove' | 'pointerUp'

/**
 * jsdom's PointerEvent drops `pointerType` from `fireEvent` init props, so force
 * it onto the native event — the stale-mouse guard keys on it, and the tests
 * below need mouse-vs-touch to be observable.
 */
function firePointer(board: HTMLElement, kind: PointerKind, init: Record<string, unknown>, pointerType: string): void {
  const event = createEvent[kind](board, init)
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  fireEvent(board, event)
}

/** Drives the native-touch path (iOS/Android), which is separate from Pointer Events. */
function touchSwipe(dx: number, dy: number): void {
  const board = screen.getByTestId('board')
  const at = (x: number, y: number): { identifier: number, clientX: number, clientY: number } => ({ identifier: 0, clientX: x, clientY: y })
  fireEvent.touchStart(board, { touches: [at(120, 120)] })
  fireEvent.touchMove(board, { touches: [at(120 + dx, 120 + dy)] })
  fireEvent.touchEnd(board, { changedTouches: [at(120 + dx, 120 + dy)] })
}

describe('Game2048', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts a fresh 4x4 run with two tiles and no score', () => {
    renderGame()

    expect(screen.getByTestId('board')).toHaveAttribute('aria-label', '4 by 4 board')
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(2)
    expect(renderedValues(4)).toEqual(boardValues(startRun(4, SEED).board))
    expect(within(screen.getByTestId('score-readout')).getByText(/Score 0, best 0, 3 undos left/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('moves with the arrow keys exactly as the engine does', () => {
    renderGame()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(renderedValues(4)).toEqual(boardValues(performMove(startRun(4, SEED), 'left').run.board))
  })

  it('moves with WASD as well', () => {
    renderGame()
    fireEvent.keyDown(window, { key: 'd' })

    expect(renderedValues(4)).toEqual(boardValues(performMove(startRun(4, SEED), 'right').run.board))
  })

  it('moves on a swipe past the threshold and ignores a tap', () => {
    renderGame()
    swipe(4, 0)
    expect(renderedValues(4)).toEqual(boardValues(startRun(4, SEED).board))

    swipe(0, 60)
    expect(renderedValues(4)).toEqual(boardValues(performMove(startRun(4, SEED), 'down').run.board))
  })

  it('takes pointer capture so a mouse drag cannot escape the board', () => {
    renderGame()
    const board = screen.getByTestId('board')
    const setPointerCapture = jest.fn()
    Object.defineProperty(board, 'setPointerCapture', { configurable: true, value: setPointerCapture })

    fireEvent.pointerDown(board, { pointerId: 1, isPrimary: true, buttons: 1, clientX: 120, clientY: 120 })
    expect(setPointerCapture).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale mouse gesture whose button was released off the board', () => {
    renderGame()
    const initial = boardValues(startRun(4, SEED).board)
    const board = screen.getByTestId('board')

    // Press, drag under the swipe threshold, then release the button outside the
    // board so the board never sees the pointerup.
    firePointer(board, 'pointerDown', { pointerId: 1, isPrimary: true, buttons: 1, clientX: 120, clientY: 120 }, 'mouse')
    firePointer(board, 'pointerMove', { pointerId: 1, buttons: 1, clientX: 130, clientY: 120 }, 'mouse')
    expect(renderedValues(4)).toEqual(initial)

    // Sweeping the unpressed cursor back across the board must not resurrect the
    // gesture, in either direction.
    firePointer(board, 'pointerMove', { pointerId: 1, buttons: 0, clientX: 260, clientY: 120 }, 'mouse')
    firePointer(board, 'pointerMove', { pointerId: 1, buttons: 0, clientX: 20, clientY: 120 }, 'mouse')
    firePointer(board, 'pointerMove', { pointerId: 1, buttons: 0, clientX: 120, clientY: 320 }, 'mouse')

    expect(renderedValues(4)).toEqual(initial)
  })

  it('moves on a native touch swipe (the iOS path, separate from Pointer Events)', () => {
    // iOS Safari mishandles Pointer Events for touch (broken capture transfer +
    // spurious pointercancel), so touch is served by native touch listeners.
    // This is the regression guard for "2048 ignores iOS swipes".
    renderGame()
    touchSwipe(0, 60)
    expect(renderedValues(4)).toEqual(boardValues(performMove(startRun(4, SEED), 'down').run.board))
  })

  it('ignores the compatibility Pointer Events iOS fires alongside touch', () => {
    renderGame()
    const board = screen.getByTestId('board')

    // A touch swipe must not also be processed through the pointer path, or it
    // would move twice. iOS tags those compatibility events `pointerType: touch`.
    firePointer(board, 'pointerDown', { pointerId: 1, isPrimary: true, clientX: 120, clientY: 120 }, 'touch')
    firePointer(board, 'pointerMove', { pointerId: 1, clientX: 120, clientY: 180 }, 'touch')
    firePointer(board, 'pointerUp', { pointerId: 1 }, 'touch')

    expect(renderedValues(4)).toEqual(boardValues(startRun(4, SEED).board))
  })

  it('drops the gesture when the pointer leaves the board mid-drag', () => {
    renderGame()
    const initial = boardValues(startRun(4, SEED).board)
    const board = screen.getByTestId('board')

    fireEvent.pointerDown(board, { pointerId: 1, isPrimary: true, buttons: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(board, { pointerId: 1, buttons: 1, clientX: 130, clientY: 120 })
    fireEvent.pointerLeave(board, { pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(board, { pointerId: 1, buttons: 1, clientX: 260, clientY: 120 })

    expect(renderedValues(4)).toEqual(initial)
  })

  it('scores merges and undoes them, up to three times', () => {
    saveRun(runFrom(boardFromValues([
      [2, 2, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [16, 16, 0, 0],
    ])))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    // 4 + 8 + 16 + 32 from the four row merges.
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 60, best 60, 3 undos left')

    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeEnabled()
    fireEvent.click(undo)

    expect(renderedValues(4)).toEqual([
      [2, 2, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [16, 16, 0, 0],
    ])
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 0, best 60, 2 undos left')
  })

  it('undoes with the Z key', () => {
    saveRun(runFrom(boardFromValues([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 4')

    fireEvent.keyDown(window, { key: 'z' })
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 0')
  })

  it('starts a different board size straight away before the first move', () => {
    renderGame()
    fireEvent.click(screen.getByTestId('board-size-6'))

    expect(screen.getByTestId('board')).toHaveAttribute('aria-label', '6 by 6 board')
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(2)
    expect(screen.getByTestId('board-size-6')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('confirm-new-game-overlay')).not.toBeInTheDocument()
  })

  it('confirms before discarding a game in progress, and records it when confirmed', () => {
    renderGame()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.click(screen.getByTestId('board-size-3'))

    expect(screen.getByTestId('confirm-new-game-overlay')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cancel-new-game-button'))
    expect(screen.getByTestId('board')).toHaveAttribute('aria-label', '4 by 4 board')

    fireEvent.click(screen.getByTestId('board-size-3'))
    fireEvent.click(screen.getByTestId('confirm-new-game-button'))

    expect(screen.getByTestId('board')).toHaveAttribute('aria-label', '3 by 3 board')
    expect(loadProgress().gamesPlayed).toBe(1)
  })

  it('resumes the autosaved run, including score and remaining undos', () => {
    const board = boardFromValues([
      [64, 32, 0, 0],
      [0, 8, 0, 0],
      [0, 0, 4, 0],
      [0, 0, 0, 2],
    ])
    saveRun(runFrom(board, { score: 1234, undosRemaining: 1, moves: 30 }))
    renderGame()

    expect(renderedValues(4)).toEqual(boardValues(board))
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 1234, best 1234, 1 undos left')
  })

  it('offers "keep going" once on reaching 2048 and does not ask again', () => {
    saveRun(runFrom(boardFromValues([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('win-overlay')).toBeInTheDocument()
    expect(loadProgress().gamesPlayed).toBe(0)

    fireEvent.click(screen.getByTestId('keep-going-button'))
    expect(screen.queryByTestId('win-overlay')).not.toBeInTheDocument()
    expect(renderedValues(4).flat()).toContain(2048)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.queryByTestId('win-overlay')).not.toBeInTheDocument()
  })

  it('shows game over, records the game, and clears the autosave', () => {
    saveRun(runFrom(boardFromValues(DEAD_END_VALUES), { score: 800, moves: 60 }))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(screen.getByTestId('game-over-overlay')).toBeInTheDocument()
    expect(loadSavedRun()).toBeNull()
    expect(loadProgress().gamesPlayed).toBe(1)
    expect(loadProgress().boards[4].bestScore).toBe(800)

    fireEvent.click(screen.getByTestId('game-over-new-game-button'))
    expect(screen.queryByTestId('game-over-overlay')).not.toBeInTheDocument()
    expect(loadProgress().gamesPlayed).toBe(1)
  })

  it('counts one physical run once even when undo revives it and it ends again', () => {
    saveRun(runFrom(boardFromValues(DEAD_END_VALUES), { score: 800, moves: 60 }))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('game-over-overlay')).toBeInTheDocument()
    expect(loadProgress().gamesPlayed).toBe(1)

    fireEvent.keyDown(window, { key: 'z' })
    expect(screen.queryByTestId('game-over-overlay')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('game-over-overlay')).toBeInTheDocument()
    expect(loadProgress().gamesPlayed).toBe(1)
  })

  it('counts a revived run once when it is abandoned instead of re-ended', () => {
    saveRun(runFrom(boardFromValues(DEAD_END_VALUES), { score: 800, moves: 60 }))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'z' })
    expect(loadProgress().gamesPlayed).toBe(1)

    fireEvent.click(within(screen.getByTestId('new-game-button')).getByRole('button'))
    fireEvent.click(screen.getByTestId('confirm-new-game-button'))

    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(2)
    expect(loadProgress().gamesPlayed).toBe(1)
    expect(loadProgress().boards[4].bestScore).toBe(800)
  })

  it('offers undo inside the game-over overlay, which covers the toolbar', () => {
    saveRun(runFrom(boardFromValues(DEAD_END_VALUES), { score: 800, moves: 60 }))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const overlay = screen.getByTestId('game-over-overlay')
    const undo = within(overlay).getByTestId('game-over-undo-button')

    fireEvent.click(undo)

    expect(screen.queryByTestId('game-over-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 800, best 800, 2 undos left')
    expect(renderedValues(4)).toEqual(DEAD_END_VALUES)
  })

  it('hides the overlay undo once the allowance is spent', () => {
    saveRun(runFrom(boardFromValues(DEAD_END_VALUES), { score: 800, moves: 60, undosRemaining: 0 }))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(screen.getByTestId('game-over-overlay')).toBeInTheDocument()
    expect(screen.queryByTestId('game-over-undo-button')).not.toBeInTheDocument()
  })

  it('ignores Z while the win overlay is waiting for a choice', () => {
    saveRun(runFrom(boardFromValues([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])))
    renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('win-overlay')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z' })

    expect(screen.getByTestId('win-overlay')).toBeInTheDocument()
    expect(renderedValues(4).flat()).toContain(2048)
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 2048, best 2048, 3 undos left')

    // The choice is still the player's, and undo works again once it is made.
    fireEvent.click(screen.getByTestId('keep-going-button'))
    fireEvent.keyDown(window, { key: 'z' })
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 0, best 2048, 2 undos left')
  })

  it('keeps the run high-water score across a reload', () => {
    saveRun(runFrom(boardFromValues([
      [2, 2, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [16, 16, 0, 0],
    ])))
    const first = renderGame()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'z' })
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 0, best 60, 2 undos left')
    expect(loadSavedRun()?.bestScore).toBe(60)

    first.unmount()
    renderGame()

    expect(screen.getByTestId('score-readout')).toHaveTextContent('Score 0, best 60, 2 undos left')

    fireEvent.click(within(screen.getByTestId('new-game-button')).getByRole('button'))
    fireEvent.click(screen.getByTestId('confirm-new-game-button'))

    expect(loadProgress().gamesPlayed).toBe(1)
    expect(loadProgress().boards[4].bestScore).toBe(60)
  })

  it('autosaves the live run so a reload resumes it', () => {
    renderGame()
    fireEvent.keyDown(window, { key: 'ArrowUp' })

    const saved = loadSavedRun()
    expect(saved?.moves).toBe(1)
    expect(boardValues(saved?.board ?? startRun(4, SEED).board))
      .toEqual(boardValues(performMove(startRun(4, SEED), 'up').run.board))
  })

  it('persists the mute preference locally', () => {
    renderGame()
    fireEvent.click(screen.getByRole('button', { name: 'Mute audio' }))

    expect(window.localStorage.getItem(TWENTY48_MUTED_STORAGE_KEY)).toBe('1')
    expect(screen.getByRole('button', { name: 'Unmute audio' })).toBeInTheDocument()
  })

  it('renders one background cell per board square', () => {
    renderGame()
    fireEvent.click(screen.getByTestId('board-size-5'))

    expect(screen.getByTestId('board').querySelectorAll('.rounded-\\[8\\%\\]')).toHaveLength(25 + 2)
  })
})
