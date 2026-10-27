import { render, screen } from '@testing-library/react'

import { CollectionTrays } from '../CollectionTrays'
import { createPuzzle, removeScrew } from '../engine'
import { COLORS, type Plate, type PuzzleLevel, type Screw,type ScrewColor } from '../level'

/** A board whose staging rack is held by one screw, beside the campaign's own levels. */
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  const panel = (id: string): Plate => ({ id, name: id, position: [0, 0, 0], size: [1, 1], normal: [0, 0, 1], up: [0, 1, 0], finish: 'side', color: '#ccc' })
  const pad = (color: Screw['color'], count: number): Screw[] => Array.from({ length: count }, (_, index) => ({ id: `${color}-${index}`, plate: 'board', color, position: [0, 0] }))
  const rack: PuzzleLevel = {
    id: 950, name: 'Rack', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'], rack: 'rack-cover',
    plates: [panel('board'), panel('rack-cover')],
    screws: [{ id: 'rack-1', plate: 'rack-cover', color: 'amber', position: [0, 0] }, ...pad('coral', 3), ...pad('mint', 3), ...pad('blue', 3), ...pad('amber', 2)],
  }
  return { ...actual, getLevel: (id: number) => id === 950 ? rack : actual.getLevel(id) }
})

test('trays communicate each color visually while keeping names in accessible labels', () => {
  const state = createPuzzle(2)
  const { container, rerender } = render(<CollectionTrays state={state} />)
  for (const color of Object.keys(COLORS) as ScrewColor[]) {
    rerender(<CollectionTrays state={{ ...state, trays: [{ id: 'left', color, count: 0 }] }} />)
    const tray = screen.getByRole('img', { name: `${COLORS[color].name} tray: 0 of 3` })
    expect(tray.querySelector('[data-tray-face]')).toHaveAttribute('fill', COLORS[color].hex)
    // An empty tray still carries its color's drive mark, so it can be matched by shape alone.
    expect(tray.querySelector('[data-tray-emblem]')).toHaveAttribute('data-tray-emblem', color)
    expect(tray.querySelector('[data-mark]')).not.toBeInTheDocument()
    for (const { name } of Object.values(COLORS)) expect(container).not.toHaveTextContent(name)
  }
})

test('stored, queued and collected screws show their drive marks', () => {
  let state = removeScrew(createPuzzle(2), 'right-roof-1')
  state = removeScrew(state, 'front-brace-1')
  const { container } = render(<CollectionTrays state={state} />)
  expect(screen.getByRole('img', { name: 'Blue screw in spare slot 1' }).querySelector('[data-mark]')).toHaveAttribute('data-mark', 'blue')
  expect(screen.getByRole('img', { name: 'Coral tray: 1 of 3' }).querySelector('[data-tray-slot="0"] [data-mark]')).toHaveAttribute('data-mark', 'coral')
  expect([...screen.getByRole('group', { name: /^Upcoming trays/ }).querySelectorAll('[data-mark]')].map((mark) => mark.getAttribute('data-mark'))).toEqual(state.queue)
  expect(container.querySelectorAll('[data-tray-emblem]')).toHaveLength(2)
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

test('the staging rack\'s slot shows from the start, locked under the rack\'s mark, and opens with the rack', () => {
  const start = createPuzzle(950)
  const { container, rerender } = render(<CollectionTrays state={start} />)
  const locked = screen.getByRole('img', { name: 'Spare slot 3 locked: free the staging rack to open it' })
  expect(locked).toHaveAttribute('data-rack-slot', 'locked')
  expect(locked).toHaveAttribute('data-spare-slot', '2')
  expect(locked.querySelector('[data-rack-mark]')).toBeInTheDocument()
  // The two base slots are ordinary, and the locked slot is not counted as room.
  expect(container.querySelectorAll('[data-spare-slot]')).toHaveLength(3)
  expect(container.querySelectorAll('[data-rack-slot]')).toHaveLength(1)
  expect(screen.getByRole('group', { name: 'Spare storage: 0 of 2' })).toBeInTheDocument()
  // Fill both base slots, then free the rack: its own screw takes the slot it opens.
  const full = removeScrew(removeScrew(start, 'blue-0'), 'amber-0')
  rerender(<CollectionTrays state={full} />)
  expect(screen.getByRole('group', { name: 'Spare storage: 2 of 2' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /^Spare slot 3 locked/ })).toBeInTheDocument()
  const opened = removeScrew(full, 'rack-1')
  rerender(<CollectionTrays state={opened} />)
  expect(screen.queryByRole('img', { name: /^Spare slot 3 locked/ })).not.toBeInTheDocument()
  const parked = screen.getByRole('img', { name: 'Amber screw in spare slot 3, on the staging rack' })
  expect(parked).toHaveAttribute('data-rack-slot', 'open')
  expect(parked.querySelector('[data-mark]')).toHaveAttribute('data-mark', 'amber')
  expect(parked.querySelector('[data-rack-mark]')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Spare storage: 3 of 3' })).toBeInTheDocument()
  // Undo is a snapshot: the earlier board shows the slot locked again with nothing in it.
  rerender(<CollectionTrays state={full} />)
  expect(screen.getByRole('img', { name: 'Spare slot 3 locked: free the staging rack to open it' })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /on the staging rack$/ })).not.toBeInTheDocument()
})

test('levels without a staging rack show no rack slot', () => {
  const { container } = render(<CollectionTrays state={createPuzzle(2)} />)
  expect(container.querySelectorAll('[data-rack-slot]')).toHaveLength(0)
  expect(container.querySelectorAll('[data-spare-slot]')).toHaveLength(2)
})
