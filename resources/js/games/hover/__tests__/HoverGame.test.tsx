import { act, fireEvent, render, screen } from '@testing-library/react'

import { HOVER_SETTINGS_STORAGE_KEY } from '../gameTypes'
import { HoverGame } from '../HoverGame'

jest.mock('../HoverScene', () => {
  const actual = jest.requireActual<typeof import('../HoverScene')>('../HoverScene')
  return {
    buildHudSnapshot: actual.buildHudSnapshot,
    HoverScene: function MockHoverScene() {
      return null
    },
  }
})

describe('HoverGame', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    window.localStorage.clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('shows the attract screen with controls and start button', () => {
    render(<HoverGame />)

    expect(screen.getByText('HOVER')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Engine' })).toBeInTheDocument()
    expect(screen.getByText(/drive & strafe/)).toBeInTheDocument()
    expect(screen.getByText(/rotate & glance/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /All Games/ })).toHaveAttribute('href', '/')
  })

  test('start → map intro banner → playing HUD', () => {
    render(<HoverGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    expect(screen.getByText('Medieval Castle')).toBeInTheDocument()
    expect(screen.getByText(/CYCLE 1/)).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(2500)
    })

    expect(screen.queryByText(/CYCLE 1/)).not.toBeInTheDocument()
    expect(screen.getByText('SCORE')).toBeInTheDocument()
    expect(screen.getByTestId('score-value')).toHaveTextContent('0')
    expect(screen.getByLabelText('Minimap')).toBeInTheDocument()
  })

  test('Escape pauses and resumes', () => {
    render(<HoverGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    act(() => {
      jest.advanceTimersByTime(2500)
    })

    fireEvent.keyDown(window, { code: 'Escape' })
    expect(screen.getByText('PAUSED')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(screen.queryByText('PAUSED')).not.toBeInTheDocument()
  })

  test('hiding the tab pauses the game', () => {
    render(<HoverGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    act(() => {
      jest.advanceTimersByTime(2500)
    })

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  test('mute toggle persists to settings', () => {
    render(<HoverGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    act(() => {
      jest.advanceTimersByTime(2500)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeInTheDocument()

    const raw = window.localStorage.getItem(HOVER_SETTINGS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}')).toEqual({ version: 1, muted: true })
  })
})
