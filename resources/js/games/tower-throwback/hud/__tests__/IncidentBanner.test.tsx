import { fireEvent, render, screen } from '@testing-library/react'

import type { BombThreatState } from '../../gameTypes'
import { FireBanner, IncidentBanner } from '../IncidentBanner'

function threat(overrides: Partial<BombThreatState> = {}): BombThreatState {
  return { kind: 'bombThreat', floor: 7, x: 30, sweepRemainingMin: null, ransom: 100_000, ...overrides }
}

describe('IncidentBanner', () => {
  it('offers ransom and sweep, wiring the resolve callback', () => {
    const onResolve = jest.fn()
    const onViewFloor = jest.fn()
    render(<IncidentBanner threat={threat()} hasSecurityOffice={true} onResolve={onResolve} onViewFloor={onViewFloor} />)

    expect(screen.getByTestId('incident-banner')).toHaveTextContent('floor 7')
    fireEvent.click(screen.getByTestId('pay-ransom'))
    expect(onResolve).toHaveBeenCalledWith('ransom')
    expect(screen.getByTestId('pay-ransom')).toHaveTextContent('$100,000')
    fireEvent.click(screen.getByTestId('start-sweep'))
    expect(onResolve).toHaveBeenCalledWith('sweep')
    expect(screen.getByTestId('start-sweep')).toHaveTextContent('Sweep')
    fireEvent.click(screen.getByTestId('view-incident-floor'))
    expect(onViewFloor).toHaveBeenCalledWith(7)
  })

  it('labels the no-office gamble and shows the sweep ETA while running', () => {
    render(<IncidentBanner threat={threat()} hasSecurityOffice={false} onResolve={jest.fn()} onViewFloor={jest.fn()} />)
    expect(screen.getByTestId('incident-banner')).toHaveTextContent('risking it (25% detonation)')
    expect(screen.getByTestId('start-sweep')).toHaveTextContent('Risk it')
  })

  it('hides the buttons and shows the countdown during a sweep', () => {
    render(<IncidentBanner threat={threat({ sweepRemainingMin: 42.4 })} hasSecurityOffice={true} onResolve={jest.fn()} onViewFloor={jest.fn()} />)
    expect(screen.getByTestId('sweep-eta')).toHaveTextContent('43 min remaining')
    expect(screen.queryByTestId('pay-ransom')).toBeNull()
    expect(screen.queryByTestId('start-sweep')).toBeNull()
  })
})

describe('FireBanner', () => {
  it('shows the response ETA and number of burning units', () => {
    const onViewFloor = jest.fn()
    render(
      <FireBanner
        fire={{ kind: 'fire', floor: 8, burningUnitIds: [2, 3], spreadRemainingMin: 4, responseRemainingMin: 12.2 }}
        onRespond={jest.fn()}
        onViewFloor={onViewFloor}
      />,
    )

    expect(screen.getByTestId('fire-banner')).toHaveTextContent('Fire on floor 8')
    expect(screen.getByTestId('fire-banner')).toHaveTextContent('Security response in 13 min')
    expect(screen.getByTestId('fire-banner')).toHaveTextContent('2 units burning')
    fireEvent.click(screen.getByTestId('view-incident-floor'))
    expect(onViewFloor).toHaveBeenCalledWith(8)
  })

  it('prices the dispatch button by burning-unit count and wires both response choices', () => {
    const onRespond = jest.fn()
    render(
      <FireBanner
        fire={{ kind: 'fire', floor: 3, burningUnitIds: [2, 3], spreadRemainingMin: 4, responseRemainingMin: 5 }}
        onRespond={onRespond}
        onViewFloor={jest.fn()}
      />,
    )

    // $3,000 base + $1,500 × 2 burning = $6,000
    expect(screen.getByTestId('fire-dispatch')).toHaveTextContent('Dispatch $6,000')
    fireEvent.click(screen.getByTestId('fire-dispatch'))
    expect(onRespond).toHaveBeenCalledWith('dispatch')
    fireEvent.click(screen.getByTestId('fire-firebreak'))
    expect(onRespond).toHaveBeenCalledWith('firebreak')
  })
})
