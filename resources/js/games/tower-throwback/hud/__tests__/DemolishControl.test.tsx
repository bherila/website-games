import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DemolishControl } from '../DemolishControl'

function renderControl(onDemolish = jest.fn()) {
  render(<DemolishControl name="Office (small)" location="Floor 3" refund="$25,000" onDemolish={onDemolish} />)
  return onDemolish
}

describe('DemolishControl', () => {
  it('does not demolish on the first click', () => {
    const onDemolish = renderControl()

    fireEvent.click(screen.getByTestId('demolish'))

    expect(onDemolish).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Demolish Office (small)?' })).toBeInTheDocument()
  })

  it('demolishes exactly once after confirming', () => {
    const onDemolish = renderControl()

    fireEvent.click(screen.getByTestId('demolish'))
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))

    expect(onDemolish).toHaveBeenCalledTimes(1)
    // The confirmation collapses back to the trigger so it cannot be re-fired.
    expect(screen.queryByTestId('confirm-destructive-action')).toBeNull()
    expect(screen.getByTestId('demolish')).toBeInTheDocument()
  })

  it('cancelling does not demolish and returns focus to the trigger', async () => {
    const onDemolish = renderControl()

    fireEvent.click(screen.getByTestId('demolish'))
    fireEvent.click(screen.getByTestId('cancel-destructive-action'))

    expect(onDemolish).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('demolish')).toHaveFocus())
  })

  it('names the target, location, and refund for screen readers', () => {
    renderControl()

    expect(screen.getByTestId('demolish')).toHaveAccessibleName(
      'Demolish Office (small) on Floor 3, refund $25,000',
    )

    fireEvent.click(screen.getByTestId('demolish'))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Floor 3')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('$25,000')
  })
})
