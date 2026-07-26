import { fireEvent, render, screen } from '@testing-library/react'

import { CameraControls } from '../CameraControls'

function handlers() {
  return { onZoomIn: jest.fn(), onZoomOut: jest.fn(), onFitTower: jest.fn() }
}

describe('CameraControls', () => {
  it('fires each camera action exactly once per press', () => {
    const h = handlers()
    render(<CameraControls {...h} />)

    fireEvent.click(screen.getByTestId('zoom-in'))
    fireEvent.click(screen.getByTestId('zoom-out'))
    fireEvent.click(screen.getByTestId('zoom-fit'))

    expect(h.onZoomIn).toHaveBeenCalledTimes(1)
    expect(h.onZoomOut).toHaveBeenCalledTimes(1)
    expect(h.onFitTower).toHaveBeenCalledTimes(1)
  })

  it('exposes text labels for icon-only buttons', () => {
    render(<CameraControls {...handlers()} />)

    // The glyphs are aria-hidden, so the accessible name has to come from the
    // button label — otherwise the controls are unusable with a screen reader.
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit whole tower' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Camera zoom' })).toBeInTheDocument()
  })

  it('is reachable by keyboard', () => {
    const h = handlers()
    render(<CameraControls {...h} />)

    const zoomIn = screen.getByTestId('zoom-in')
    zoomIn.focus()
    expect(zoomIn).toHaveFocus()
    fireEvent.click(zoomIn)
    expect(h.onZoomIn).toHaveBeenCalled()
  })
})
