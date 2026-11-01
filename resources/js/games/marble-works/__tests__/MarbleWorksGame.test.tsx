import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'

import { MARBLE_WORKS_PROGRESS_STORAGE_KEY } from '../gameTypes'
import { MarbleWorksGame } from '../MarbleWorksGame'
import type { MarbleWorksSceneProps } from '../MarbleWorksScene'
import type { RunResult } from '../physics/runWorld'

function result(status: RunResult['status'], gems: number): RunResult {
  return { status, failedMarble: status === 'won' ? -1 : 0, paths: [[[1, 1], [2, 0]]], pathSteps: [[0, 6]], elapsed: 1, gems, allGems: false, home: 0, firstContacts: new Map() }
}

/** Pointer type the scene stub reports; tests switch it to 'mouse' for desktop flows. */
let mockPointerType = 'touch'

jest.mock('../MarbleWorksScene', () => ({
  MarbleWorksScene: (props: MarbleWorksSceneProps) => {
    const { onLayout } = props
    useEffect(() => {
      onLayout({ width: 600, height: 800, cellSize: 80, left: 0, top: 0 })
    }, [onLayout])
    const pointer = (type: 'down' | 'up' | 'move', col: number, row: number) => props.onBoardPointer({
      type,
      cell: { col, row },
      clientX: 0,
      clientY: 0,
      pointerType: mockPointerType,
      pressed: type !== 'up',
    })

    return (
      <div
        data-editing={String(props.editing)}
        data-free-cells={props.freeCells.map((cell) => `${cell.col},${cell.row}`).join(' ')}
        data-ghost={props.ghost ? (props.ghost.ok ? 'ok' : 'bad') : 'none'}
        data-ghost-path={props.ghostPaths ? String(props.ghostPaths.length) : 'none'}
        data-placements={props.placements.map((placement) => `${placement.pieceId}@${placement.col},${placement.row}${placement.flipped ? 'F' : ''}`).join(' ')}
        data-run-token={String(props.runToken)}
        data-testid="scene-stub"
        data-tutorial-cell={props.tutorialCell ? `${props.tutorialCell.col},${props.tutorialCell.row}` : 'none'}
      >
        {[...Array(props.level.cols).keys()].flatMap((col) => [...Array(props.level.rows).keys()].map((row) => (
          <span key={`${col}-${row}`}>
            <button type="button" onClick={() => pointer('down', col, row)}>{`down-${col}-${row}`}</button>
            <button type="button" onClick={() => pointer('move', col, row)}>{`move-${col}-${row}`}</button>
            <button type="button" onClick={() => pointer('up', col, row)}>{`up-${col}-${row}`}</button>
          </span>
        )))}
        <button type="button" onClick={() => props.onRunEnd(result('won', props.level.gems.length))}>run-won</button>
        <button type="button" onClick={() => props.onRunEnd(result('won', 0))}>run-won-no-gems</button>
        <button type="button" onClick={() => props.onRunEnd(result('out', 0))}>run-out</button>
      </div>
    )
  },
}))

function tapCell(col: number, row: number): void {
  fireEvent.click(screen.getByRole('button', { name: `down-${col}-${row}` }))
  fireEvent.click(screen.getByRole('button', { name: `up-${col}-${row}` }))
}

/** A mouse press on a tray card, dragged far enough to count as a drag. */
function startTrayDrag(pieceId: string): void {
  fireEvent.pointerDown(screen.getByTestId(`tray-${pieceId}`), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 60, clientY: 10 })
}

function scene(): HTMLElement {
  return screen.getByTestId('scene-stub')
}

describe('MarbleWorksGame', () => {
  beforeEach(() => {
    mockPointerType = 'touch'
    window.localStorage.clear()
    window.history.pushState({}, '', '/marble-works')
  })

  it('opens on the level select with only level 1 unlocked', () => {
    render(<MarbleWorksGame />)

    expect(screen.getByRole('button', { name: 'Level 1, 0 stars' })).toBeInTheDocument()
    expect(screen.getByLabelText('Level 2 locked')).toBeInTheDocument()
    expect(screen.getByLabelText('Level 12 locked')).toBeInTheDocument()
  })

  it('walks the tutorial: pick the ramp, place it, press Go, win and unlock level 2', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))

    expect(screen.getByTestId('tutorial-message')).toHaveTextContent('Tap the ramp')
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    expect(screen.getByTestId('tutorial-message')).toHaveTextContent('glowing spot')
    expect(scene()).toHaveAttribute('data-tutorial-cell', '1,3')

    tapCell(1, 3)
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@1,3')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 0 left')
    expect(screen.getByTestId('tutorial-message')).toHaveTextContent('Press Go')

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(scene()).toHaveAttribute('data-editing', 'false')
    expect(scene()).toHaveAttribute('data-run-token', '1')

    fireEvent.click(screen.getByRole('button', { name: 'run-won' }))
    expect(screen.getByRole('dialog', { name: 'Level complete' })).toBeInTheDocument()
    expect(screen.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '3')
    expect(JSON.parse(window.localStorage.getItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      unlockedLevel: 2,
      stars: { 1: 3 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next level' }))
    expect(screen.getByTestId('level-pill')).toHaveTextContent('Zig-Zag')
  })

  it('does not advance the tutorial to Go while the ramp is flipped the wrong way', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(1, 3)
    tapCell(1, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Flip piece' }))

    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@1,3F')
    expect(screen.getByTestId('tutorial-message')).toHaveTextContent('use Flip')
    expect(scene()).toHaveAttribute('data-tutorial-cell', '1,3')

    fireEvent.click(screen.getByRole('button', { name: 'Flip piece' }))
    expect(screen.getByTestId('tutorial-message')).toHaveTextContent('Press Go')
  })

  it('highlights only cells where the armed piece’s whole footprint fits', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 12, stars: {} }))
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 12, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-funnel'))

    const cells = (scene().getAttribute('data-free-cells') ?? '').split(' ')
    // The 3-wide funnel centres on the tapped cell, so the edge columns can never host it…
    expect(cells).not.toContain('0,1')
    expect(cells).not.toContain('8,1')
    // …nor can a cell whose neighbour is a block (the shaft walls).
    expect(cells).not.toContain('3,4')
    expect(cells).not.toContain('5,5')
    expect(cells).toContain('4,1')
    // The chamber above the basket is exactly a Funnel wide.
    expect(cells).toContain('4,7')
  })

  it('rejects placements on blocked cells and shows a red ghost while dragging there', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))

    fireEvent.click(screen.getByRole('button', { name: 'down-3-3' }))
    expect(scene()).toHaveAttribute('data-ghost', 'bad')
    fireEvent.click(screen.getByRole('button', { name: 'up-3-3' }))

    expect(scene()).toHaveAttribute('data-placements', '')
    expect(scene()).toHaveAttribute('data-ghost', 'none')
  })

  it('selects a placed piece to flip, move and remove it', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(3, 2)
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))

    tapCell(3, 2)
    expect(screen.getByTestId('piece-action-bar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate piece' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Flip piece' }))
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2F')

    fireEvent.click(screen.getByRole('button', { name: 'down-3-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'move-2-3' }))
    expect(scene()).toHaveAttribute('data-ghost', 'ok')
    fireEvent.click(screen.getByRole('button', { name: 'up-2-3' }))
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@2,3F')

    tapCell(2, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove piece' }))
    expect(scene()).toHaveAttribute('data-placements', '')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 4 left')
  })

  it('drags one piece from the tray onto the board with a mouse, leaving nothing picked', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    mockPointerType = 'mouse'
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))

    startTrayDrag('ramp-steep')
    expect(screen.getByTestId('tray-drag-icon')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'move-3-2' }))
    expect(scene()).toHaveAttribute('data-ghost', 'ok')
    expect(screen.queryByTestId('tray-drag-icon')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'up-3-2' }))
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse' })

    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2')
    expect(scene()).toHaveAttribute('data-ghost', 'none')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 3 left')

    // The dropped piece is selected, so it can be flipped straight away.
    expect(screen.getByTestId('piece-action-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Flip piece' }))
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2F')

    // Nothing is still picked, so clicking empty board just clears the selection.
    tapCell(1, 1)
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2F')
    expect(screen.queryByTestId('piece-action-bar')).not.toBeInTheDocument()
  })

  it('drops nothing when a tray drag is released off the board', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    mockPointerType = 'mouse'
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))

    startTrayDrag('ramp-steep')
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse' })
    // Releasing over the card itself clicks it; that must not pick the piece.
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))

    expect(scene()).toHaveAttribute('data-placements', '')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('tray-drag-icon')).not.toBeInTheDocument()
  })

  it('places one piece per click-pick with a mouse, but keeps the pick for the next tap on touch', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    mockPointerType = 'mouse'
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))

    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(3, 2)
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAttribute('aria-pressed', 'false')

    mockPointerType = 'touch'
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(1, 1)
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@3,2 ramp-steep@1,1')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shakes instead of arming a used-up piece', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(1, 3)

    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('tray-ramp-steep')).toHaveClass('marble-works-shake')
  })

  it('reports a failed run, keeps the last path, and returns to building', () => {
    jest.useFakeTimers()
    try {
      render(<MarbleWorksGame />)
      fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
      fireEvent.click(screen.getByRole('button', { name: 'Go' }))
      fireEvent.click(screen.getByRole('button', { name: 'run-out' }))

      expect(screen.getByTestId('run-failed')).toHaveTextContent('fell off the board')
      expect(scene()).toHaveAttribute('data-ghost-path', '1')
      act(() => {
        jest.advanceTimersByTime(1000)
      })
      expect(scene()).toHaveAttribute('data-editing', 'true')
      expect(scene()).toHaveAttribute('data-run-token', 'null')
    } finally {
      jest.useRealTimers()
    }
  })

  it('Stop ends a run early and keeps the pieces', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(1, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(scene()).toHaveAttribute('data-editing', 'true')
    expect(scene()).toHaveAttribute('data-placements', 'ramp-steep@1,3')
  })

  it('awards a star each for collecting every gem and for staying within par', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(3, 2)
    tapCell(2, 3)
    tapCell(3, 4)
    tapCell(2, 5)
    expect(screen.getByTestId('par-pill')).toHaveTextContent('4/ 3')
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'run-won' }))

    expect(screen.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '2')
    expect(screen.getByTestId('level-complete-goals')).toHaveTextContent('Gems 1 of 1')
    expect(screen.getByTestId('level-complete-goals')).toHaveTextContent('4 pieces (par 3)')

    fireEvent.click(screen.getByRole('button', { name: 'Replay level' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'run-won-no-gems' }))
    expect(screen.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '1')
  })

  it('names the marble that failed', () => {
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'run-out' }))

    expect(screen.getByTestId('run-failed')).toHaveTextContent('The glass marble fell off the board.')
    expect(scene()).toHaveAttribute('data-ghost-path', '1')
  })
})
