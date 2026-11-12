import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'

import type { EngineState } from '../gameTypes'
import { HOVER_SETTINGS_STORAGE_KEY } from '../gameTypes'
import { HoverGame } from '../HoverGame'
import type { GraphicsStatus } from '../HoverScene'

let mockSceneProps: { engineRef: { current: EngineState | null }; onGraphicsStatus: (status: GraphicsStatus) => void; onEvents: (events: Array<{ kind: 'win' | 'lose' }>) => void; running: boolean; graphicsAttempt: number; readInput: () => { thrust: number } }
let mockGraphicsReady = true

jest.mock('../HoverScene', () => {
  const actual = jest.requireActual<typeof import('../HoverScene')>('../HoverScene')
  return {
    buildHudSnapshot: actual.buildHudSnapshot,
    HoverScene: function MockHoverScene(props: typeof mockSceneProps) {
      mockSceneProps = props
      useEffect(() => {
        if (mockGraphicsReady) props.onGraphicsStatus('ready')
      })
      return null
    },
  }
})

describe('HoverGame', () => {
  beforeEach(() => {
    mockGraphicsReady = true
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

  test('graphics failure holds the intro and retry preserves the same round and native controls', () => {
    render(<HoverGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    const state = mockSceneProps.engineRef.current!
    state.score = 1234
    state.lossesOnMap = 2
    const before = JSON.stringify(state)
    fireEvent.keyDown(window, { code: 'KeyW' })
    act(() => {
      mockGraphicsReady = false
      mockSceneProps.onGraphicsStatus('failed')
    })
    expect(screen.getByRole('button', { name: 'Retry graphics' })).toHaveFocus()
    expect(screen.getByRole('link', { name: /All Games/ })).toHaveAttribute('href', '/')
    expect(screen.queryByText(/CYCLE 1/)).not.toBeInTheDocument()
    expect(mockSceneProps.running).toBe(false)
    expect(mockSceneProps.readInput().thrust).toBe(0)
    fireEvent.keyDown(window, { code: 'Escape' })
    act(() => jest.advanceTimersByTime(10_000))
    fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
    expect(mockSceneProps.graphicsAttempt).toBe(1)
    expect(mockSceneProps.engineRef.current).toBe(state)
    expect(JSON.stringify(state)).toBe(before)
    act(() => mockSceneProps.onGraphicsStatus('ready'))
    expect(mockSceneProps.readInput().thrust).toBe(0)
    expect(screen.getByText(/CYCLE 1/)).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(2500))
    expect(mockSceneProps.running).toBe(true)
  })

  test.each(['win', 'lose'] as const)('graphics hold suspends the %s transition deadline', (kind) => {
    render(<HoverGame />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Engine' }))
    act(() => jest.advanceTimersByTime(2500))
    const state = mockSceneProps.engineRef.current!
    act(() => mockSceneProps.onEvents([{ kind }]))
    act(() => jest.advanceTimersByTime(500))
    act(() => {
      mockGraphicsReady = false
      mockSceneProps.onGraphicsStatus('failed')
    })
    act(() => jest.advanceTimersByTime(10_000))
    expect(mockSceneProps.engineRef.current).toBe(state)
    act(() => mockSceneProps.onGraphicsStatus('ready'))
    act(() => jest.advanceTimersByTime(2000))
    expect(mockSceneProps.engineRef.current).toBe(state)
    act(() => jest.advanceTimersByTime(501))
    expect(mockSceneProps.engineRef.current).not.toBe(state)
    expect(mockSceneProps.engineRef.current?.roundIndex).toBe(kind === 'win' ? 1 : 0)
    expect(mockSceneProps.engineRef.current?.lossesOnMap).toBe(kind === 'win' ? 0 : 1)
  })

})
