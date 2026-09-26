import { fireEvent, render, screen } from '@testing-library/react'

import { LEVELS } from '../levels/levels'
import { PieceTray } from '../ui/PieceTray'

const LEVEL = LEVELS.find((level) => level.id === 12)
if (!LEVEL) {
  throw new Error('missing level 12')
}

describe('PieceTray', () => {
  it('shows only the level inventory, grouped by family, with counts', () => {
    render(<PieceTray armed={null} disabled={false} level={LEVEL} remaining={{ ...LEVEL.inventory, 'ramp-gentle': 1 }} shakePiece={null} onArm={jest.fn()} />)

    const cards = screen.getAllByRole('button')
    expect(cards.map((card) => card.getAttribute('data-piece'))).toEqual([
      'track-long', 'ramp-gentle', 'uturn', 'tube', 'tube-elbow', 'funnel', 'kicker', 'launcher', 'bumper',
    ])
    expect(screen.getByTestId('tray-ramp-gentle')).toHaveAccessibleName('Gentle Ramp, 1 left')
    expect(screen.queryByTestId('tray-trampoline')).not.toBeInTheDocument()
  })

  it('marks the armed card and greys out used-up cards', () => {
    render(<PieceTray armed="kicker" disabled={false} level={LEVEL} remaining={{ ...LEVEL.inventory, bumper: 0 }} shakePiece={null} onArm={jest.fn()} />)

    expect(screen.getByTestId('tray-kicker')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tray-bumper')).toHaveTextContent('×0')
    expect(screen.getByTestId('tray-bumper').querySelector('[data-piece-icon]')?.innerHTML).toContain('#94a3b8')
  })

  it('arms on click and disables the whole tray during a run', () => {
    const onArm = jest.fn()
    const { rerender } = render(<PieceTray armed={null} disabled={false} level={LEVEL} remaining={LEVEL.inventory} shakePiece={null} onArm={onArm} />)
    fireEvent.click(screen.getByTestId('tray-launcher'))
    expect(onArm).toHaveBeenCalledWith('launcher')

    rerender(<PieceTray armed={null} disabled level={LEVEL} remaining={LEVEL.inventory} shakePiece={null} onArm={onArm} />)
    expect(screen.getByTestId('piece-tray')).toHaveClass('pointer-events-none')
  })
})
