import { render, screen } from '@testing-library/react'

import type { SaveHealth } from '../../saveHealth'
import { SaveHealthReadout } from '../SaveHealthReadout'

function health(overrides: Partial<SaveHealth> = {}): SaveHealth {
  return { status: 'idle', lastSavedAt: null, error: null, ...overrides }
}

describe('SaveHealthReadout', () => {
  it('renders nothing before anything has happened', () => {
    const { container } = render(<SaveHealthReadout health={health()} now={0} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows each status', () => {
    const cases = [
      ['saving', 'Saving…'],
      ['pending', 'Unsaved changes'],
      ['saved', 'Saved'],
    ] as const

    for (const [status, label] of cases) {
      const view = render(<SaveHealthReadout health={health({ status, lastSavedAt: 0 })} now={0} />)
      expect(screen.getByTestId('save-health')).toHaveTextContent(label)
      view.unmount()
    }
  })

  it('announces a failure assertively and names the cause', () => {
    render(
      <SaveHealthReadout
        health={health({ status: 'failed', error: 'Browser storage is full.', lastSavedAt: 0 })}
        now={60_000}
      />,
    )

    const readout = screen.getByTestId('save-health')
    // A silent save failure is the exact thing this feature exists to prevent,
    // so it gets alert semantics rather than polite status semantics.
    expect(readout).toHaveAttribute('role', 'alert')
    expect(readout).toHaveAttribute('data-status', 'failed')
    expect(screen.getByTestId('save-health-error')).toHaveTextContent('Browser storage is full.')
  })

  it('shows the last successful save time when healthy', () => {
    render(<SaveHealthReadout health={health({ status: 'saved', lastSavedAt: 0 })} now={90_000} />)

    expect(screen.getByTestId('save-health-time')).toHaveTextContent('1m ago')
    expect(screen.getByTestId('save-health')).toHaveAttribute('role', 'status')
  })
})
