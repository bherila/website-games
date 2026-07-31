import { fireEvent, render, screen } from '@testing-library/react'

import { LoanDialog } from '../LoanDialog'

describe('LoanDialog', () => {
  it('steps the amount in $100k increments between the suggestion and the 2× cap', () => {
    const onAccept = jest.fn()
    render(
      <LoanDialog prompt={{ shortfall: 249_900, suggested: 300_000 }} hasLoans={false} onAccept={onAccept} onDecline={jest.fn()} />,
    )

    expect(screen.getByTestId('shortfall')).toHaveTextContent('$249,900')
    expect(screen.getByTestId('amount')).toHaveTextContent('$300,000')
    expect(screen.getByText('Loan offer')).toBeInTheDocument()

    // Can't go below the suggested amount.
    expect(screen.getByTestId('amount-down')).toBeDisabled()
    fireEvent.click(screen.getByTestId('amount-up'))
    expect(screen.getByTestId('amount')).toHaveTextContent('$400,000')
    fireEvent.click(screen.getByTestId('amount-up'))
    fireEvent.click(screen.getByTestId('amount-up'))
    expect(screen.getByTestId('amount')).toHaveTextContent('$600,000')
    expect(screen.getByTestId('amount-up')).toBeDisabled()
    expect(screen.getByText('Maximum offer: $600,000')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('accept-loan'))
    expect(onAccept).toHaveBeenCalledWith(600_000)
  })

  it('uses the same cap for refinancing and declines', () => {
    const onDecline = jest.fn()
    render(
      <LoanDialog prompt={{ shortfall: 1000, suggested: 100_000 }} hasLoans={true} onAccept={jest.fn()} onDecline={onDecline} />,
    )
    expect(screen.getByText('Refinance offer')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('amount-up'))
    expect(screen.getByTestId('amount')).toHaveTextContent('$200,000')
    expect(screen.getByTestId('amount-up')).toBeDisabled()
    fireEvent.click(screen.getByTestId('decline-loan'))
    expect(onDecline).toHaveBeenCalled()
  })

  it('raises the selected amount when an active offer gains another shortfall', () => {
    const { rerender } = render(
      <LoanDialog prompt={{ shortfall: 90_000, suggested: 100_000 }} hasLoans={false} onAccept={jest.fn()} onDecline={jest.fn()} />,
    )

    rerender(
      <LoanDialog prompt={{ shortfall: 110_000, suggested: 200_000 }} hasLoans={false} onAccept={jest.fn()} onDecline={jest.fn()} />,
    )

    expect(screen.getByTestId('shortfall')).toHaveTextContent('$110,000')
    expect(screen.getByTestId('amount')).toHaveTextContent('$200,000')
    expect(screen.getByText('Maximum offer: $400,000')).toBeInTheDocument()
  })
})
