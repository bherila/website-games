import { act, fireEvent, render, screen } from '@testing-library/react'

import { removeScrew } from '../engine'
import { getLevel } from '../level'
import { PlateEscapeGame } from '../PlateEscapeGame'
import { PlateEscapeScene } from '../PlateEscapeScene'

let mockReady = true
const mockPlay = jest.fn()
jest.mock('../sfx', () => ({
  ...jest.requireActual<typeof import('../sfx')>('../sfx'),
  createPlateSfx: () => ({ play: mockPlay, unlock: jest.fn(), dispose: jest.fn(), setMuted: jest.fn() }),
}))
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean, children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
jest.mock('../PlateEscapeScene', () => {
  const { useLayoutEffect } = jest.requireActual<typeof import('react')>('react')
  const { getLevel } = jest.requireActual<typeof import('../level')>('../level')
  return { PlateEscapeScene: jest.fn(({ onReady, onError, onTargets, state }: React.ComponentProps<typeof PlateEscapeScene>) => {
    useLayoutEffect(() => {
      if (mockReady) onReady()
      else onError('Graphics unavailable')
    }, [onReady, onError])
    useLayoutEffect(() => onTargets(getLevel(state.level).screws
      .filter((screw) => !state.removed.includes(screw.id))
      .map((screw) => ({ id: screw.id, x: 100, y: 100 }))), [state, onTargets])
    return <div />
  }) }
})

function props() {
  return jest.mocked(PlateEscapeScene).mock.calls.at(-1)![0]
}
function collect(id: string): void {
  fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-screw-id="${id}"]`)!)
  act(() => jest.advanceTimersByTime(700))
}
function start(): void {
  render(<PlateEscapeGame />)
  fireEvent.click(screen.getByTestId('level-tile-1'))
}

beforeEach(() => {
  jest.useFakeTimers()
  localStorage.clear()
  history.replaceState({}, '', '/')
  mockReady = true
  mockPlay.mockClear()
})
afterEach(() => { jest.useRealTimers() })

test('retry preserves the puzzle, trays and undo history while unavailable mutations are blocked', () => {
  start()
  collect('right-roof-1')
  collect('front-1')
  const before = props().state
  const scene = props()
  const undo = screen.getByRole('button', { name: /^Undo$/ })
  act(() => scene.onError('Graphics unavailable'))
  expect(undo).toBeDisabled()
  fireEvent.click(undo)
  // Stale target publication cannot bypass the synchronous readiness guard.
  act(() => scene.onTargets([{ id: 'right-roof-2', x: 100, y: 100 }]))
  collect('right-roof-2')
  expect(props().state).toBe(before)
  expect(screen.getByTestId('screw-progress')).toHaveTextContent('2 / 9 screws')
  mockReady = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(props().state).toBe(before)
  expect(undo).toBeDisabled()
  mockReady = true
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(props().state).toBe(before)
  expect(props().state.trays).toEqual(before.trays)
  expect(props().state.spare).toEqual(before.spare)
  fireEvent.click(undo)
  expect(props().state.removed).toEqual(['right-roof-1'])
  fireEvent.click(screen.getByRole('button', { name: /^Restart$/ }))
  expect(props().state.removed).toEqual([])
  expect(undo).toBeDisabled()
})

test('a dial turn survives retry and can still be undone', () => {
  history.replaceState({}, '', '/plate-escape?lab=dial-pin')
  render(<PlateEscapeGame />)
  fireEvent.click(screen.getByRole('button', { name: "Let's play" }))
  collect('door-pin')
  const right = screen.getByRole('button', { name: 'Turn the combination dial right' })
  fireEvent.click(right)
  const before = props().state
  expect(before.dials.dial).toBe(1)
  act(() => props().onError('Graphics unavailable'))
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  expect(props().state).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  expect(props().state).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }))
  expect(props().state.dials.dial).toBe(0)
  expect(props().state.removed).toEqual(['door-pin'])
})

test('startup failure blocks moves and keeps preferences and the level menu usable', () => {
  mockReady = false
  start()
  collect('front-1')
  expect(props().state.removed).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
  expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^Levels$/ }))
  expect(screen.getByTestId('level-tile-1')).toBeVisible()
})

test('retry after the final move retains the clear without replaying win audio or recording progress again', () => {
  start()
  for (let count = 0; count < 9; count++) {
    const state = props().state
    const screw = getLevel(1).screws.find((candidate) => removeScrew(state, candidate.id) !== state)!
    collect(screw.id)
  }
  const before = props().state
  const saved = localStorage.getItem('bwh.plate-escape.progress.v1')
  expect(saved).not.toBeNull()
  const wins = mockPlay.mock.calls.filter(([sound]) => sound === 'win').length
  act(() => props().onError('Graphics unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
  act(() => jest.advanceTimersByTime(2000))
  expect(props().state).toBe(before)
  expect(localStorage.getItem('bwh.plate-escape.progress.v1')).toBe(saved)
  expect(screen.getByRole('heading', { name: 'All plates free!' })).toBeVisible()
  expect(mockPlay.mock.calls.filter(([sound]) => sound === 'win')).toHaveLength(wins)
})
