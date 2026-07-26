import { fireEvent, render, screen, within } from '@testing-library/react'

import type { DayLedger } from '../../gameTypes'
import { FinancialsPanel } from '../FinancialsPanel'

describe('FinancialsPanel', () => {
  it('groups income vs expenses with day columns, totals, and loans', () => {
    const history: DayLedger[] = [
      { day: 3, lines: { 'rent.office': 500, 'maint.transit': -200, 'loan.repayment': -5000 } },
      { day: 2, lines: { 'rent.office': 500, 'maint.transit': -200 } },
      { day: 1, lines: { construction: -70_000 } },
    ]
    const today: DayLedger = { day: 4, lines: { 'sales.commerce': 45 } }

    render(
      <FinancialsPanel
        ledgerHistory={history}
        ledgerToday={today}
        loans={[{ id: 9, principal: 100_000, outstanding: 95_000 }]}
      />,
    )

    expect(screen.getByTestId('row-rent.office')).toHaveTextContent('Office rent')
    expect(screen.getByTestId('row-rent.office')).toHaveTextContent('$500')
    expect(screen.getByTestId('row-maint.transit')).toHaveTextContent('Transit upkeep')
    expect(screen.getByTestId('row-construction')).toHaveTextContent('-$70,000')
    expect(screen.getByTestId('row-sales.commerce')).toHaveTextContent('$45')
    // Zero-only lines are hidden entirely.
    expect(screen.queryByTestId('row-hotel.nights')).toBeNull()

    // Totals: day 3 nets 500 − 200 − 5000 = −4700.
    expect(screen.getByTestId('totals-row')).toHaveTextContent('-$4,700')

    // Loans list with 5%/day repayment.
    expect(screen.getByTestId('loan-9')).toHaveTextContent('$95,000 outstanding · $4,750/day')
  })

  it('renders today alone when there is no history', () => {
    render(<FinancialsPanel ledgerHistory={[]} ledgerToday={{ day: 1, lines: {} }} loans={[]} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByTestId('totals-row')).toHaveTextContent('$0')
  })

  it('plots a 30-point trend strip oldest → newest with today last', () => {
    // 29 settled days (newest-first) + today = 30 trend points.
    const history: DayLedger[] = Array.from({ length: 29 }, (_, i) => {
      const day = 30 - i // 30 (newest) … 2 (oldest)
      return { day, lines: { 'rent.office': day } as DayLedger['lines'] }
    })
    const today: DayLedger = { day: 31, lines: { 'rent.office': 999 } }

    render(<FinancialsPanel ledgerHistory={history} ledgerToday={today} loans={[]} />)

    const bars = screen.getAllByTestId('trend-bar')
    expect(bars).toHaveLength(30)
    // Oldest first (day 2, net 2), today last (day 31, net 999).
    expect(bars[0]).toHaveAttribute('data-net', '2')
    expect(bars[29]).toHaveAttribute('data-net', '999')
  })

  it('renders only the available points when fewer than 30 days exist', () => {
    const history: DayLedger[] = [
      { day: 3, lines: { 'rent.office': 100 } },
      { day: 2, lines: { 'rent.office': 200 } },
      { day: 1, lines: { 'rent.office': 300 } },
    ]
    render(<FinancialsPanel ledgerHistory={history} ledgerToday={{ day: 4, lines: {} }} loans={[]} />)
    expect(screen.getAllByTestId('trend-bar')).toHaveLength(4)
  })

  it('styles negative-net bars distinctly from positive ones', () => {
    const history: DayLedger[] = [{ day: 1, lines: { construction: -5000 } }]
    render(<FinancialsPanel ledgerHistory={history} ledgerToday={{ day: 2, lines: { 'rent.office': 500 } }} loans={[]} />)
    const bars = screen.getAllByTestId('trend-bar')
    expect(bars[0]).toHaveClass('fill-red-400') // day 1 net −5000
    expect(bars[1]).toHaveClass('fill-emerald-400') // today net +500
  })

  it('toggles the table span between 7 and 30 days', () => {
    const history: DayLedger[] = Array.from({ length: 29 }, (_, i) => {
      const day = 30 - i
      return { day, lines: { 'rent.office': day } as DayLedger['lines'] }
    })
    render(<FinancialsPanel ledgerHistory={history} ledgerToday={{ day: 31, lines: { 'rent.office': 1 } }} loans={[]} />)

    const officeRow = screen.getByTestId('row-rent.office')
    // Default 7d span: 6 history columns + today = 7 value cells.
    expect(within(officeRow).getAllByRole('cell')).toHaveLength(1 + 7)

    fireEvent.click(screen.getByTestId('table-span-30'))
    // 30d span: 29 history columns + today = 30 value cells.
    expect(within(screen.getByTestId('row-rent.office')).getAllByRole('cell')).toHaveLength(1 + 30)

    fireEvent.click(screen.getByTestId('table-span-7'))
    expect(within(screen.getByTestId('row-rent.office')).getAllByRole('cell')).toHaveLength(1 + 7)
  })
})
