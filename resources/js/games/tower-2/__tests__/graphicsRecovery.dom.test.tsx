import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'

import { resetGameDataPersistenceForTests } from '../../_shared/gameDataPersistence'
import { starterBuilding } from '../engine/building'
import { TOWER_2_STORAGE_KEY } from '../gameProgress'
import { Tower2Renderer } from '../scene/Tower2Renderer'
import { Tower2Game } from '../Tower2Game'

jest.mock('../scene/Tower2Renderer', () => ({ Tower2Renderer: jest.fn() }))

const construct = jest.mocked(Tower2Renderer)
function graphics() {
  return { setSize: jest.fn(), dispose: jest.fn(), renderer: { info: { render: { frame: 0 } } } } as unknown as Tower2Renderer
}

beforeEach(() => {
  jest.useFakeTimers()
  resetGameDataPersistenceForTests()
  localStorage.clear()
  localStorage.setItem('tower-2-tutorial', 'off')
  construct.mockReset().mockImplementation(() => graphics())
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), disconnect: jest.fn() }))
})
afterEach(() => {
  resetGameDataPersistenceForTests()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('keeps the saved plan mounted through repeated failures, isolates controls, and resumes keyboard building and undo', () => {
  const saved = JSON.stringify(starterBuilding().snapshot())
  localStorage.setItem(TOWER_2_STORAGE_KEY, saved)
  construct.mockImplementationOnce(() => { throw new Error('No WebGL') })
    .mockImplementationOnce(() => { throw new Error('Still unavailable') })
  const view = render(<Tower2Game />)
  const plan = screen.getByLabelText('Building plan')
  const retry = screen.getByRole('button', { name: 'Try again' })
  expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Graphics unavailable')
  expect(retry).toHaveFocus()
  expect(plan.closest('[inert]')).not.toBeNull()
  expect(plan).toHaveAttribute('tabindex', '-1')
  expect(screen.getByTestId('tower2-room-count')).toHaveTextContent('4')
  fireEvent.keyDown(window, { key: 'i' })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(plan, { key: 'Enter' })
  fireEvent.keyDown(plan, { key: 'Enter' })
  fireEvent.keyDown(retry, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('link', { name: 'Back to games' })).toHaveFocus()
  expect(window.__tower2).toBeUndefined()
  act(() => jest.advanceTimersByTime(500))
  expect(localStorage.getItem(TOWER_2_STORAGE_KEY)).toBe(saved)
  act(() => retry.focus())
  fireEvent.click(retry)
  expect(retry).toHaveFocus()
  expect(screen.getByRole('alertdialog')).toBeVisible()
  fireEvent.click(retry)
  act(() => jest.advanceTimersByTime(0))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Building plan')).toBe(plan)
  expect(plan.closest('[inert]')).toBeNull()
  expect(plan).toHaveFocus()
  expect(construct).toHaveBeenCalledTimes(3)
  expect(localStorage.getItem(TOWER_2_STORAGE_KEY)).toBe(saved)
  // A real edit through the existing parent/history, then undo and redo.
  fireEvent.click(screen.getByRole('button', { name: 'Start over on an empty site with the tutorial' }))
  expect(screen.getByTestId('tower2-room-count')).toHaveTextContent('0')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(screen.getByTestId('tower2-room-count')).toHaveTextContent('4')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  fireEvent.focus(plan)
  fireEvent.keyDown(plan, { key: 'Enter' })
  fireEvent.keyDown(plan, { key: 'ArrowLeft' })
  fireEvent.keyDown(plan, { key: 'Enter' })
  expect(screen.getByTestId('tower2-floor-area')).toHaveTextContent('18 m²')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(screen.getByTestId('tower2-floor-area')).toHaveTextContent('0 m²')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(screen.getByTestId('tower2-floor-area')).toHaveTextContent('18 m²')
  act(() => jest.advanceTimersByTime(500))
  expect(localStorage.getItem(TOWER_2_STORAGE_KEY)).not.toBe(saved)
  const renderer = construct.mock.results[2]!.value as Tower2Renderer
  view.unmount()
  expect(renderer.dispose).toHaveBeenCalledTimes(1)
  expect(window.__tower2).toBeUndefined()
})

test('disposes a renderer whose initial sizing fails before adding listeners or a loop', () => {
  const failed = graphics()
  jest.mocked(failed.setSize).mockImplementation(() => { throw new Error('Sizing failed') })
  construct.mockImplementationOnce(() => failed)
  const view = render(<Tower2Game />)
  expect(failed.dispose).toHaveBeenCalledTimes(1)
  expect(ResizeObserver).not.toHaveBeenCalled()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  const ready = construct.mock.results[1]!.value as Tower2Renderer
  view.unmount()
  expect(failed.dispose).toHaveBeenCalledTimes(1)
  expect(ready.dispose).toHaveBeenCalledTimes(1)
})

test('still offers recovery when disposing a failed startup also throws', () => {
  const failed = graphics()
  jest.mocked(failed.setSize).mockImplementation(() => { throw new Error('Sizing failed') })
  jest.mocked(failed.dispose).mockImplementation(() => { throw new Error('Cleanup failed') })
  construct.mockImplementationOnce(() => failed)
  render(<Tower2Game />)
  expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Graphics unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(construct).toHaveBeenCalledTimes(2)
})

test('StrictMode replays dispose each successful mount and leave only one keyboard handler', () => {
  const view = render(<StrictMode><Tower2Game /></StrictMode>)
  expect(construct).toHaveBeenCalledTimes(2)
  const first = construct.mock.results[0]!.value as Tower2Renderer
  const second = construct.mock.results[1]!.value as Tower2Renderer
  expect(first.dispose).toHaveBeenCalledTimes(1)
  expect(second.dispose).not.toHaveBeenCalled()
  const plan = screen.getByLabelText('Building plan')
  fireEvent.focus(plan)
  fireEvent.keyDown(plan, { key: 'Enter' })
  fireEvent.keyDown(plan, { key: 'ArrowLeft' })
  fireEvent.keyDown(plan, { key: 'Enter' })
  expect(screen.getByTestId('tower2-floor-area')).toHaveTextContent('18 m²')
  view.unmount()
  expect(second.dispose).toHaveBeenCalledTimes(1)
  expect(window.__tower2).toBeUndefined()
})
