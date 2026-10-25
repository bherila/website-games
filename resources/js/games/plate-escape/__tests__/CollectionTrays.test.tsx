import { render, screen } from '@testing-library/react'

import { CollectionTrays } from '../CollectionTrays'
import { createPuzzle, removeScrew } from '../engine'
import { COLORS, type ScrewColor } from '../level'

test('trays communicate each color visually while keeping names in accessible labels', () => {
  const state = createPuzzle(2)
  const { container, rerender } = render(<CollectionTrays state={state} />)
  for (const color of Object.keys(COLORS) as ScrewColor[]) {
    rerender(<CollectionTrays state={{ ...state, trays: [{ id: 'left', color, count: 0 }] }} />)
    const tray = screen.getByRole('img', { name: `${COLORS[color].name} tray: 0 of 3` })
    expect(tray.querySelector('[data-tray-face]')).toHaveAttribute('fill', COLORS[color].hex)
    for (const { name } of Object.values(COLORS)) expect(container).not.toHaveTextContent(name)
  }
})

test('a completed tray adopts the incoming color and displays screws drained from storage', () => {
  let state = removeScrew(createPuzzle(2), 'right-roof-1')
  const { rerender } = render(<CollectionTrays state={state} />)
  expect(screen.getByRole('img', { name: 'Blue screw in spare slot 1' })).toBeInTheDocument()
  for (const id of ['front-brace-1', 'back-brace-1', 'left-1']) state = removeScrew(state, id)
  rerender(<CollectionTrays state={state} />)
  const tray = screen.getByRole('img', { name: 'Blue tray: 1 of 3' })
  expect(tray.querySelector('[data-tray-face]')).toHaveAttribute('fill', COLORS.blue.hex)
  expect(tray.querySelector('[data-tray-slot="0"] svg')).toBeInTheDocument()
  expect(tray.querySelector('[data-tray-slot="1"] svg')).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Blue screw in spare slot 1' })).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Upcoming trays: Amber' })).toBeInTheDocument()
})
