import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import {
  appendToastHistory,
  TOAST_HISTORY_LIMIT,
  ToastHistoryButton,
  ToastHistoryDrawer,
  type ToastHistoryItem,
} from '../ToastHistoryDrawer'
import type { ToastItem } from '../Toasts'

function toast(index: number, title = `Event ${index}`): ToastItem {
  return { id: `toast-${index}`, type: 'info', title }
}

function Harness({ history }: { history: ToastHistoryItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ToastHistoryButton count={history.length} open={open} onToggle={() => setOpen((visible) => !visible)} />
      {open && <ToastHistoryDrawer history={history} onClose={() => setOpen(false)} />}
    </>
  )
}

describe('toast history', () => {
  it('retains the newest 50 entries beyond the live-toast cap', () => {
    let history: ToastHistoryItem[] = []
    for (let index = 0; index < TOAST_HISTORY_LIMIT + 8; index += 1) {
      history = appendToastHistory(history, [toast(index)], { day: 2, minute: index })
    }

    expect(history).toHaveLength(TOAST_HISTORY_LIMIT)
    expect(history[0]?.toast.title).toBe(`Event ${TOAST_HISTORY_LIMIT + 7}`)
    expect(history.at(-1)?.toast.title).toBe('Event 8')
  })

  it('stores a coalesced toast once and orders the latest batch newest first', () => {
    const coalesced = toast(1, 'Action rejected ×12')
    const history = appendToastHistory([], [coalesced, toast(2)], { day: 3, minute: 485 })

    expect(history.map((entry) => entry.toast.title)).toEqual(['Event 2', 'Action rejected ×12'])
    expect(history.filter((entry) => entry.toast.title === 'Action rejected ×12')).toHaveLength(1)
  })

  it('opens from the bell and closes from the drawer button', () => {
    const history = appendToastHistory([], [toast(1)], { day: 3, minute: 485 })
    render(<Harness history={history} />)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle recent events' }))
    expect(screen.getByRole('complementary', { name: 'Recent events' })).toBeInTheDocument()
    expect(screen.getByText('Day 3 · 08:05')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close recent events' }))
    expect(screen.queryByRole('complementary', { name: 'Recent events' })).not.toBeInTheDocument()
  })

  it('renders durable detail lines that stay out of the live toast body', () => {
    const report = toast(1, 'Star lost')
    report.body = 'Population fell below 5,000'
    report.details = ['Needs three restaurants', 'VIP visit failed']
    const history = appendToastHistory([], [report], { day: 3, minute: 485 })
    render(<ToastHistoryDrawer history={history} onClose={jest.fn()} />)

    const details = screen.getByRole('list', { name: 'Event details' })
    expect(details).toHaveTextContent('Needs three restaurants')
    expect(details).toHaveTextContent('VIP visit failed')
    expect(details).not.toHaveTextContent('Population fell below 5,000')
  })
})
