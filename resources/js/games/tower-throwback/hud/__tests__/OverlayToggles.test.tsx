import { fireEvent, render, screen } from '@testing-library/react'

import { OverlayToggles } from '../OverlayToggles'

describe('OverlayToggles', () => {
  it('marks the active choice and reports changes', () => {
    const onSetOverlay = jest.fn()
    render(<OverlayToggles overlay="noise" onSetOverlay={onSetOverlay} />)

    expect(screen.getByTestId('overlay-noise')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('overlay-none')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByTestId('overlay-congestion'))
    expect(onSetOverlay).toHaveBeenCalledWith('congestion')
    fireEvent.click(screen.getByTestId('overlay-eval'))
    expect(onSetOverlay).toHaveBeenCalledWith('eval')
    fireEvent.click(screen.getByTestId('overlay-none'))
    expect(onSetOverlay).toHaveBeenCalledWith(null)
  })

  it.each([
    ['noise', 'Noise exposure', 'Loud 30+'],
    ['congestion', 'Elevator wait', '20m+'],
    ['eval', 'Desirability', 'Strong 100'],
  ] as const)('labels the %s overlay with its scale', (overlay, label, highLabel) => {
    render(<OverlayToggles overlay={overlay} onSetOverlay={jest.fn()} />)

    const legend = screen.getByTestId(`overlay-legend-${overlay}`)
    expect(legend).toHaveTextContent(label)
    expect(legend).toHaveTextContent(highLabel)
    expect(screen.getByTestId('overlay-legend-ramp')).toBeVisible()
  })

  it('hides the legend when overlays are off', () => {
    render(<OverlayToggles overlay={null} onSetOverlay={jest.fn()} />)
    expect(screen.queryByTestId(/overlay-legend-/)).not.toBeInTheDocument()
  })
})
