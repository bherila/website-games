import { fireEvent, render, screen } from '@testing-library/react'

import { TowerComplete } from '../TowerComplete'

describe('TowerComplete', () => {
  it('renders the celebration stats and dismisses', () => {
    const onDismiss = jest.fn()
    render(<TowerComplete daysElapsed={148} population={12_450} funds={3_250_000} endgameKind="cathedral" onDismiss={onDismiss} />)

    expect(screen.getByTestId('tower-complete')).toHaveTextContent('TOWER')
    expect(screen.getByTestId('stat-days')).toHaveTextContent('148')
    expect(screen.getByTestId('stat-population')).toHaveTextContent('12,450')
    expect(screen.getByTestId('stat-funds')).toHaveTextContent('$3,250,000')

    fireEvent.click(screen.getByTestId('keep-building'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('uses Niagara-specific celebration copy for the Observation Deck', () => {
    render(<TowerComplete daysElapsed={90} population={10_100} funds={2_000_000} endgameKind="observationDeck" onDismiss={jest.fn()} />)

    expect(screen.getByTestId('tower-complete')).toHaveTextContent('Observation Deck opens above the gorge')
    expect(screen.getByTestId('tower-complete')).not.toHaveTextContent('cathedral bells')
  })
})
