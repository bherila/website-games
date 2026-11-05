import { fireEvent, render, screen } from '@testing-library/react'

import { LEVELS } from '../levels/levels'
import { PieceTray } from '../ui/PieceTray'

const LEVEL = LEVELS.find((level) => level.title === 'Grand Machine')
if (!LEVEL) {
  throw new Error('missing Grand Machine')
}

describe('PieceTray', () => {
  it('shows only the level inventory, grouped by family, with counts', () => {
    render(<PieceTray armed={null} disabled={false} level={LEVEL} remaining={{ ...LEVEL.inventory, 'ramp-steep': 2 }} shakePiece={null} onArm={jest.fn()} />)

    const cards = screen.getAllByRole('button')
    expect(cards.map((card) => card.getAttribute('data-piece'))).toEqual([
      'track-short', 'ramp-steep', 'uturn', 'sieve', 'toggle', 'glass-track',
    ])
    expect(screen.getByTestId('tray-ramp-steep')).toHaveAccessibleName('Steep Ramp, 2 left')
    expect(screen.queryByTestId('tray-trampoline')).not.toBeInTheDocument()
  })

  it('marks the armed card and greys out used-up cards', () => {
    render(<PieceTray armed="toggle" disabled={false} level={LEVEL} remaining={{ ...LEVEL.inventory, sieve: 0 }} shakePiece={null} onArm={jest.fn()} />)

    expect(screen.getByTestId('tray-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tray-sieve')).toHaveTextContent('×0')
    expect(screen.getByTestId('tray-sieve').querySelector('[data-piece-icon]')?.innerHTML).toContain('#94a3b8')
  })

  it('arms on click and disables the whole tray during a run', () => {
    const onArm = jest.fn()
    const { rerender } = render(<PieceTray armed={null} disabled={false} level={LEVEL} remaining={LEVEL.inventory} shakePiece={null} onArm={onArm} />)
    fireEvent.click(screen.getByTestId('tray-sieve'))
    expect(onArm).toHaveBeenCalledWith('sieve')

    rerender(<PieceTray armed={null} disabled level={LEVEL} remaining={LEVEL.inventory} shakePiece={null} onArm={onArm} />)
    expect(screen.getByTestId('piece-tray')).toHaveClass('pointer-events-none')
  })
})
