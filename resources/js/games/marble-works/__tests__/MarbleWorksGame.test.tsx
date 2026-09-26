import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'

import { MARBLE_WORKS_PROGRESS_STORAGE_KEY } from '../gameTypes'
import { MarbleWorksGame } from '../MarbleWorksGame'
import type { MarbleWorksSceneProps } from '../MarbleWorksScene'

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
      pointerType: 'touch',
      pressed: type !== 'up',
    })

    return (
      <div
        data-editing={String(props.editing)}
        data-free-cells={props.freeCells.map((cell) => `${cell.col},${cell.row}`).join(' ')}
        data-ghost={props.ghost ? (props.ghost.ok ? 'ok' : 'bad') : 'none'}
        data-ghost-path={props.ghostPath ? String(props.ghostPath.length) : 'none'}
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
        <button type="button" onClick={() => props.onRunEnd('won', [[1, 1]])}>run-won</button>
        <button type="button" onClick={() => props.onRunEnd('out', [[1, 1], [2, 0]])}>run-out</button>
      </div>
    )
  },
}))

function tapCell(col: number, row: number): void {
  fireEvent.click(screen.getByRole('button', { name: `down-${col}-${row}` }))
  fireEvent.click(screen.getByRole('button', { name: `up-${col}-${row}` }))
}

function scene(): HTMLElement {
  return screen.getByTestId('scene-stub')
}

describe('MarbleWorksGame', () => {
  beforeEach(() => {
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
    expect(cells).not.toContain('7,1')
    // …nor can a cell whose neighbour is a block or a no-build cell.
    expect(cells).not.toContain('4,6')
    expect(cells).not.toContain('4,2')
    expect(cells).toContain('3,1')
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
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 3 left')
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
      expect(scene()).toHaveAttribute('data-ghost-path', '2')
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

  it('awards fewer stars above par', () => {
    window.localStorage.setItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3 } }))
    render(<MarbleWorksGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))
    fireEvent.click(screen.getByTestId('tray-ramp-steep'))
    tapCell(3, 2)
    tapCell(2, 3)
    tapCell(1, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'run-won' }))

    expect(screen.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '2')
  })
})
