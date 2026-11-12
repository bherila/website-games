import { act, fireEvent, render, screen } from '@testing-library/react'

import { MathHordeGame } from '../MathHordeGame'
import { MathHordeScene } from '../MathHordeScene'

let mockGraphicsStatus: 'loading' | 'ready' | 'error' = 'ready'
jest.mock('../MathHordeScene', () => {
  const { useLayoutEffect } = jest.requireActual('react')

  return { MathHordeScene: jest.fn(({ onGraphicsStatus, graphicsAttempt }) => {
    useLayoutEffect(() => onGraphicsStatus(mockGraphicsStatus), [graphicsAttempt, onGraphicsStatus])

    return <div data-testid="mock-math-horde-scene" />
  }) }
})

function startPlaying(): void {
  render(<MathHordeGame />)
  fireEvent.click(screen.getByTestId('level-tile-1'))
  fireEvent.click(screen.getByRole('button', { name: 'START FIRING' }))
}

function currentGameState() {
  return jest.mocked(MathHordeScene).mock.calls.at(-1)![0].state
}

describe('MathHordeGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockGraphicsStatus = 'ready'
  })

  it('starts at the campaign level select', () => {
    render(<MathHordeGame />)
    expect(screen.getByText('Math Horde')).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
  })

  it('opens the tutorial before the first run', () => {
    render(<MathHordeGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument()
    expect(screen.getByText(/blue grows your crowd, red shrinks it/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'START FIRING' }))
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument()
  })

  it('hides the boss bar on ordinary levels and toggles the mute preference', () => {
    render(<MathHordeGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.queryByText('BOSS')).not.toBeInTheDocument()
    expect(screen.getByTestId('army-size')).toHaveTextContent('5')

    const muteButton = screen.getByRole('button', { name: 'Mute sound' })
    fireEvent.click(muteButton)
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeInTheDocument()
    expect(window.localStorage.getItem('bwh.math-horde.muted.v1')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Unmute sound' }))
    expect(screen.getByRole('button', { name: 'Mute sound' })).toBeInTheDocument()
    expect(window.localStorage.getItem('bwh.math-horde.muted.v1')).toBe('0')
  })

  it.each(['Space', 'Escape'])('pauses and resumes once per %s press, ignoring held-key repeats', (code) => {
    startPlaying()

    expect(fireEvent.keyDown(window, { code })).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()

    for (let repeat = 0; repeat < 3; repeat++) {
      expect(fireEvent.keyDown(window, { code, repeat: true })).toBe(false)
      expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
    }

    fireEvent.keyUp(window, { code })
    fireEvent.keyDown(window, { code })
    expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { code, repeat: true })
    expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()
  })

  it('leaves focused toolbar buttons and their icons to handle keyboard activation', () => {
    startPlaying()
    const mute = screen.getByRole('button', { name: 'Mute sound' })
    mute.focus()

    expect(fireEvent.keyDown(mute, { code: 'Space' })).toBe(true)
    expect(fireEvent.keyDown(mute, { code: 'Escape' })).toBe(true)
    expect(fireEvent.keyDown(mute.querySelector('svg')!, { code: 'Space' })).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()

    fireEvent.click(mute)
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeInTheDocument()
  })

  it.each(['input', 'textarea', 'select', 'a', 'contenteditable'])('leaves %s keyboard input and navigation alone', (control) => {
    startPlaying()
    const element = document.createElement(control === 'contenteditable' ? 'div' : control)
    if (control === 'a') {
      element.setAttribute('href', '#test')
    }
    if (control === 'contenteditable') {
      element.setAttribute('contenteditable', 'true')
      element.setAttribute('tabindex', '0')
    }
    document.body.append(element)
    element.focus()
    const state = currentGameState()
    const originalTarget = state.targetX

    try {
      for (const code of ['Space', 'Escape', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']) {
        expect(fireEvent.keyDown(element, { code })).toBe(true)
      }
      expect(state.targetX).toBe(originalTarget)
      expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()
    } finally {
      element.remove()
    }
  })

  it.each([
    ['ArrowLeft', -1],
    ['KeyA', -1],
    ['ArrowRight', 1],
    ['KeyD', 1],
  ] as const)('keeps %s steering autorepeat while playing and stops movement while paused', (code, direction) => {
    startPlaying()
    const state = currentGameState()
    const originalTarget = state.targetX

    expect(fireEvent.keyDown(window, { code })).toBe(false)
    expect(state.targetX).toBeCloseTo(originalTarget + 0.8 * direction)
    expect(fireEvent.keyDown(window, { code, repeat: true })).toBe(false)
    expect(state.targetX).toBeCloseTo(originalTarget + 1.6 * direction)

    fireEvent.keyDown(window, { code: 'Escape' })
    fireEvent.keyDown(window, { code, repeat: true })
    expect(state.targetX).toBeCloseTo(originalTarget + 1.6 * direction)
  })
  it('freezes parent shortcuts and callbacks until graphics recover around the same run', () => {
    startPlaying()
    const props = jest.mocked(MathHordeScene).mock.calls.at(-1)![0]
    const state = props.state
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    const target = state.targetX
    act(() => props.onGraphicsStatus('error'))
    expect(screen.getByRole('dialog', { name: 'Graphics unavailable' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry graphics' })).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()
    const progress = window.localStorage.getItem('bwh.math-horde.progress.v1')
    act(() => {
      props.onHud({ armySize: 99, progress: 1, score: 999, bossCount: null, bossInitialCount: null })
      props.onFinish({ ...state, status: 'won', score: 999 })
    })
    expect(window.localStorage.getItem('bwh.math-horde.progress.v1')).toBe(progress)
    fireEvent.keyDown(window, { code: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { code: 'Space' })
    expect(state.targetX).toBe(target)
    const retry = screen.getByRole('button', { name: 'Retry graphics' })
    expect(fireEvent.keyDown(retry, { code: 'Space' })).toBe(true)
    fireEvent.click(retry)
    expect(currentGameState()).toBe(state)
    const paused = screen.getByRole('dialog', { name: 'Game paused' })
    const resume = screen.getAllByRole('button', { name: 'Resume' }).at(-1)!
    expect(resume).toHaveFocus()
    expect(screen.getByTestId('army-size')).toHaveTextContent('5')
    fireEvent.click(resume)
    expect(paused).not.toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'ArrowRight', repeat: true })
    expect(state.targetX).toBe(target)
    fireEvent.keyUp(window, { code: 'ArrowRight' })
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(state.targetX).toBeCloseTo(target + 0.8)
  })

  it('keeps recovery above the tutorial and offers a safe level menu after repeated failure', () => {
    mockGraphicsStatus = 'error'
    render(<MathHordeGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    const state = currentGameState()
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry graphics' }))
    expect(currentGameState()).toBe(state)
    expect(screen.getByRole('button', { name: 'Retry graphics' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Level select' }))
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
    expect(state.elapsed).toBe(0)
  })

})
