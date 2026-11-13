import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'

import { ChicksGame } from '../ChicksGame'
import { type GraphicsStatus, STEP_TWEEN_MS } from '../gameTypes'

interface ScenePlayerProbeProps {
  onGraphicsStatus?: (status: GraphicsStatus) => void
  state: { player: { pos: { x: number, y: number } } }
}

/**
 * Set by the commit-timing test below. Called from the stub scene's passive
 * effect, which React runs child-first: after the commit's DOM mutation and after
 * `ChicksGame`'s layout effects, but before `ChicksGame`'s own passive effects.
 */
let mockOnSceneCommit: (() => void) | null = null

// The real scene needs WebGL; this stub exposes the engine's player position so a
// rotated-input assertion can check the move that actually reached the reducer.
jest.mock('../ChicksScene', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')

  return {
    ChicksScene: ({ state, onGraphicsStatus }: ScenePlayerProbeProps) => {
      useEffect(() => onGraphicsStatus?.('ready'), [onGraphicsStatus])
      useEffect(() => {
        mockOnSceneCommit?.()
      })

      return <div data-testid="scene-player">{`${state.player.pos.x},${state.player.pos.y}`}</div>
    },
  }
})

// A synthetic 5x13 open room (id 9003, outside the shipped 1..40 range) so the
// rotation assertions don't depend on a shipped level's geometry: the player
// starts dead center with all four steps legal and distinguishable.
jest.mock('../levels', () => {
  const actual = jest.requireActual('../levels')
  const tallRoom = {
    grid: [
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#...#',
      '#...#',
      '#.@.#',
      '#...#',
      '#...#',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ],
    id: 9003,
    par: 1,
    title: 'Test Tall Room',
  }

  return {
    ...actual,
    getLevelById: (id: number) => (id === tallRoom.id ? tallRoom : actual.getLevelById(id)),
  }
})

const START = '2,6'

function mockBoardArea(width: number, height: number): void {
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        bottom: height,
        height,
        left: 0,
        right: width,
        toJSON: () => ({}),
        top: 0,
        width,
        x: 0,
        y: 0,
      }) as DOMRect,
  )
}

function renderTallRoom(width: number, height: number): void {
  mockBoardArea(width, height)
  window.history.pushState({}, '', '/chicks-challenge?level=9003')
  render(<ChicksGame />)
}

function rotor(): HTMLElement {
  return screen.getByTestId('chips-board-rotor')
}

function playerPos(): string {
  return screen.getByTestId('scene-player').textContent ?? ''
}

/** Runs the STEP_TWEEN_MS tick that hands one queued intent to the engine. */
function flushOneMove(): void {
  act(() => {
    jest.advanceTimersByTime(STEP_TWEEN_MS)
  })
}

/** Installs a `screen.orientation` (absent in jsdom) reporting the given angle. */
function mockScreenOrientation(angle: number): void {
  const target = new EventTarget()
  Object.defineProperty(target, 'angle', { configurable: true, value: angle })
  Object.defineProperty(window.screen, 'orientation', { configurable: true, value: target })
}

function stubPointerCapture(element: HTMLElement): void {
  element.setPointerCapture = jest.fn()
  element.releasePointerCapture = jest.fn()
  element.hasPointerCapture = jest.fn(() => true)
}

describe('ChicksGame board rotation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 1 })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'maxTouchPoints')
    Reflect.deleteProperty(window.screen, 'orientation')
    Reflect.deleteProperty(document, 'hidden')
    mockOnSceneCommit = null
  })

  it('accepts fresh keyboard and D-pad input after StrictMode effect replay', () => {
    mockBoardArea(375, 600)
    window.history.pushState({}, '', '/chicks-challenge?level=9003')
    render(<StrictMode><ChicksGame /></StrictMode>)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyUp(window, { key: 'ArrowDown' })
    flushOneMove()
    expect(playerPos()).toBe('2,7')
    const down = screen.getByTestId('touch-dpad-down')
    stubPointerCapture(down)
    fireEvent.pointerDown(down, { pointerId: 1 })
    fireEvent.pointerUp(down, { pointerId: 1 })
    flushOneMove()
    expect(playerPos()).toBe('2,8')
  })

  it.each(['blur', 'hidden'] as const)('discards held keyboard and queued moves on %s while preserving undo', (loss) => {
    renderTallRoom(375, 600)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    flushOneMove()
    expect(playerPos()).toBe('2,7')
    // Queue a second direction without consuming it; both holds and buffers must clear.
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    if (loss === 'blur') fireEvent(window, new Event('blur'))
    else {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      fireEvent(document, new Event('visibilitychange'))
    }
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    act(() => jest.advanceTimersByTime(1200))
    expect(playerPos()).toBe('2,7')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    fireEvent(document, new Event('visibilitychange'))
    fireEvent(window, new Event('focus'))
    // Native repeat from a key still physically held cannot restart our repeat timer.
    fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true })
    act(() => jest.advanceTimersByTime(1200))
    expect(playerPos()).toBe('2,7')
    fireEvent.click(screen.getByTestId('undo-button'))
    expect(playerPos()).toBe(START)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    flushOneMove()
    expect(playerPos()).toBe('2,7')
    act(() => jest.advanceTimersByTime(450))
    expect(playerPos()).not.toBe('2,7')
    fireEvent.keyUp(window, { key: 'ArrowDown' })
  })

  it.each(['dpad', 'swipe', 'unfinished swipe'] as const)('cancels %s across blur and requires a fresh gesture', (source) => {
    renderTallRoom(375, 600)
    const target = source === 'dpad' ? screen.getByTestId('touch-dpad-down') : screen.getByTestId('chips-board')
    stubPointerCapture(target)
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 180, clientY: 200 })
    if (source === 'swipe') fireEvent.pointerMove(target, { pointerId: 1, clientX: 180, clientY: 250 })
    if (source !== 'unfinished swipe') flushOneMove()
    const before = playerPos()
    fireEvent(window, new Event('blur'))
    act(() => jest.advanceTimersByTime(1200))
    fireEvent(window, new Event('focus'))
    // A stale drag crossing the threshold after return must also be discarded.
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 180, clientY: 280 })
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 180, clientY: 280 })
    act(() => jest.advanceTimersByTime(1200))
    expect(playerPos()).toBe(before)
    fireEvent.pointerDown(target, { pointerId: 2, clientX: 180, clientY: 200 })
    if (source !== 'dpad') fireEvent.pointerMove(target, { pointerId: 2, clientX: 180, clientY: 250 })
    fireEvent.pointerUp(target, { pointerId: 2, clientX: 180, clientY: 250 })
    flushOneMove()
    expect(playerPos()).not.toBe(before)
  })

  it('rotates the board a quarter turn and swaps the rotor box in a landscape viewport', () => {
    renderTallRoom(812, 300)

    expect(rotor()).toHaveAttribute('data-quarter-turns', '1')
    expect(rotor().style.transform).toBe('translate(-50%, -50%) rotate(90deg)')
    expect(rotor().style.width).toBe('300px')
    expect(rotor().style.height).toBe('812px')
  })

  it('leaves the board upright in a portrait viewport', () => {
    renderTallRoom(375, 600)

    expect(rotor()).toHaveAttribute('data-quarter-turns', '0')
    expect(rotor().style.transform).toBe('translate(-50%, -50%) rotate(0deg)')
    expect(rotor().style.width).toBe('375px')
    expect(rotor().style.height).toBe('600px')
  })

  it('rotates only the board — the HUD, toolbar and D-pad stay upright', () => {
    renderTallRoom(812, 300)

    const board = rotor()
    expect(board.contains(screen.getByLabelText('Level 9003'))).toBe(false)
    expect(board.contains(screen.getByTestId('chips-toolbar'))).toBe(false)
    expect(board.contains(screen.getByTestId('touch-dpad'))).toBe(false)
    expect(board.contains(screen.getByTestId('orientation-toggle'))).toBe(false)
    // The scene itself is the only thing inside the rotated container.
    expect(board.contains(screen.getByTestId('scene-player'))).toBe(true)
  })

  it('remaps a D-pad press to board space while rotated', () => {
    renderTallRoom(812, 300)
    expect(playerPos()).toBe(START)

    const up = screen.getByTestId('touch-dpad-up')
    stubPointerCapture(up)
    fireEvent.pointerDown(up, { pointerId: 1 })
    fireEvent.pointerUp(up, { pointerId: 1 })
    flushOneMove()

    // Screen-up on a board turned 90deg clockwise is board-left: x decreases, y holds.
    expect(playerPos()).toBe('1,6')
  })

  it('turns the board counter-clockwise when the device reports a clockwise turn', () => {
    mockScreenOrientation(270)
    renderTallRoom(812, 300)

    expect(rotor()).toHaveAttribute('data-quarter-turns', '3')
    expect(rotor().style.transform).toBe('translate(-50%, -50%) rotate(270deg)')
    // Same axis swap as a clockwise turn — only the transform differs.
    expect(rotor().style.width).toBe('300px')
    expect(rotor().style.height).toBe('812px')
  })

  it('remaps input by the mirror mapping on a counter-clockwise board', () => {
    mockScreenOrientation(270)
    renderTallRoom(812, 300)
    expect(rotor()).toHaveAttribute('data-quarter-turns', '3')

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    flushOneMove()

    // Screen-up on a board turned 90deg counter-clockwise is board-right.
    expect(playerPos()).toBe('3,6')
  })

  it('remaps a keyboard step to board space while rotated', () => {
    renderTallRoom(812, 300)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    flushOneMove()

    // Screen-right becomes board-up: y decreases, x holds.
    expect(playerPos()).toBe('2,5')
  })

  it('remaps a swipe to board space while rotated', () => {
    renderTallRoom(812, 300)

    const board = screen.getByTestId('chips-board')
    stubPointerCapture(board)
    fireEvent.pointerDown(board, { clientX: 400, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 400, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 400, clientY: 200, pointerId: 1 })
    flushOneMove()

    // A downward swipe reads as board-right once the board is turned clockwise.
    expect(playerPos()).toBe('3,6')
  })

  it('does not remap input while the board is upright', () => {
    renderTallRoom(375, 600)

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    flushOneMove()

    expect(playerPos()).toBe('2,5')
  })

  it('lets the toolbar toggle override auto rotation and persists the device preference', () => {
    renderTallRoom(375, 600)
    expect(rotor()).toHaveAttribute('data-quarter-turns', '0')

    const toggle = screen.getByTestId('orientation-toggle')
    expect(toggle).toHaveAttribute('data-orientation-preference', 'auto')

    act(() => {
      fireEvent.click(toggle)
    })

    expect(toggle).toHaveAttribute('data-orientation-preference', 'rotated')
    expect(rotor()).toHaveAttribute('data-quarter-turns', '1')
    expect(window.localStorage.getItem('bwh.chicks-challenge.board-orientation.v1')).toBe('"rotated"')

    // ...and input follows the forced rotation.
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    flushOneMove()
    expect(playerPos()).toBe('1,6')
  })

  it('locks the board upright on the third toggle press even where auto would rotate', () => {
    renderTallRoom(812, 300)
    expect(rotor()).toHaveAttribute('data-quarter-turns', '1')

    const toggle = screen.getByTestId('orientation-toggle')
    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle).toHaveAttribute('data-orientation-preference', 'rotated')

    act(() => {
      fireEvent.click(toggle)
    })

    expect(toggle).toHaveAttribute('data-orientation-preference', 'upright')
    expect(rotor()).toHaveAttribute('data-quarter-turns', '0')
    expect(window.localStorage.getItem('bwh.chicks-challenge.board-orientation.v1')).toBe('"upright"')
  })

  it('remaps an input that lands after the rotated commit but before passive effects', () => {
    renderTallRoom(375, 600)
    expect(rotor()).toHaveAttribute('data-quarter-turns', '0')

    // Fire the input from the child scene's passive effect: the rotated board is
    // already committed (and painted, in a browser) while ChicksGame's own passive
    // effects have not run yet — the window in which a passive-effect ref sync
    // still holds the previous rotation.
    let dispatched = false
    mockOnSceneCommit = (): void => {
      if (dispatched || rotor().getAttribute('data-quarter-turns') !== '1') {
        return
      }
      dispatched = true
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }))
    }

    act(() => {
      fireEvent.click(screen.getByTestId('orientation-toggle'))
    })
    mockOnSceneCommit = null
    expect(dispatched).toBe(true)

    flushOneMove()

    // Screen-up under the rotation the player can already see is board-left.
    expect(playerPos()).toBe('1,6')
  })

  it('restores a persisted rotation preference on load', () => {
    window.localStorage.setItem('bwh.chicks-challenge.board-orientation.v1', '"upright"')

    renderTallRoom(812, 300)

    expect(rotor()).toHaveAttribute('data-quarter-turns', '0')
    expect(screen.getByTestId('orientation-toggle')).toHaveAttribute('data-orientation-preference', 'upright')
  })
})
