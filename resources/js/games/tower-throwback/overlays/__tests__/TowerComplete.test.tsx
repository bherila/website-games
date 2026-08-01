import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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

  it('owns focus and Escape while restoring the previous control on unmount', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const onDismiss = jest.fn()
    const rendered = render(
      <TowerComplete daysElapsed={90} population={10_100} funds={2_000_000} endgameKind="observationDeck" onDismiss={onDismiss} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'TOWER' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('keep-building')).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    rendered.unmount()
    await waitFor(() => expect(trigger).toHaveFocus())
    trigger.remove()
  })
})
