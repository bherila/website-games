import { fireEvent, render, screen } from '@testing-library/react'

import { MoreSheet } from '../MoreSheet'

test('the More sheet owns focus, traps Tab, and closes with Escape', () => {
  const onClose = jest.fn()
  render(<MoreSheet onClose={onClose} onRestoreFocus={jest.fn()}>{() => <button type="button">Inventory</button>}</MoreSheet>)
  const close = screen.getByRole('button', { name: 'Close More' })
  const inventory = screen.getByRole('button', { name: 'Inventory' })
  expect(screen.getByRole('dialog', { name: 'More' })).toHaveAttribute('aria-modal', 'true')
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(inventory).toHaveFocus()
  fireEvent.keyDown(inventory, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a child dialog action restores focus before the next dialog mounts', () => {
  const order: string[] = []
  render(
    <MoreSheet onClose={() => order.push('close')} onRestoreFocus={() => order.push('restore')}>
      {(close) => <button type="button" onClick={() => { close(); order.push('open inventory') }}>Inventory</button>}
    </MoreSheet>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Inventory' }))
  expect(order).toEqual(['restore', 'close', 'open inventory'])
})
