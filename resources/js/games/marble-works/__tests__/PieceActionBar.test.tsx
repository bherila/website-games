import { fireEvent, render, screen } from '@testing-library/react'

import { PieceActionBar } from '../ui/PieceActionBar'

function renderBar(overrides: Partial<Parameters<typeof PieceActionBar>[0]> = {}) {
  const handlers = { onRotate: jest.fn(), onFlip: jest.fn(), onRemove: jest.fn() }
  render(
    <PieceActionBar
      canFlip
      canRotate
      containerHeight={800}
      containerWidth={600}
      flipFits
      flipped={false}
      pieceBottom={380}
      pieceId="bumper"
      pieceTop={300}
      rotateFits
      variant={0}
      x={300}
      {...handlers}
      {...overrides}
    />,
  )

  return handlers
}

describe('PieceActionBar', () => {
  it('previews the piece as each action would leave it, with shortcut tooltips', () => {
    renderBar()

    const rotate = screen.getByRole('button', { name: 'Rotate piece' })
    const flip = screen.getByRole('button', { name: 'Flip piece' })
    expect(rotate).toHaveTextContent('Rotate')
    expect(rotate).toHaveAttribute('title', 'Rotate (R)')
    expect(flip).toHaveAttribute('title', 'Flip left–right (F)')
    expect(screen.getByRole('button', { name: 'Remove piece' })).toHaveAttribute('title', 'Remove (Delete)')
    expect(rotate.querySelector('[data-piece-icon="bumper"]')).not.toBeNull()
    expect(flip.querySelector('[data-piece-icon="bumper"]')).not.toBeNull()
  })

  it('disables an action that would not fit, and says why', () => {
    const { onRotate, onFlip } = renderBar({ rotateFits: false })

    const rotate = screen.getByRole('button', { name: 'Rotate piece' })
    expect(rotate).toBeDisabled()
    expect(rotate).toHaveAttribute('title', 'No room to rotate here')
    fireEvent.click(rotate)
    expect(onRotate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Flip piece' }))
    expect(onFlip).toHaveBeenCalledTimes(1)
  })

  it('leaves out actions the piece does not have', () => {
    renderBar({ pieceId: 'ramp-steep', canRotate: false })

    expect(screen.queryByRole('button', { name: 'Rotate piece' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Flip piece' })).toBeInTheDocument()
  })
})
