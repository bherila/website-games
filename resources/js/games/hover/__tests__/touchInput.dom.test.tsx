import { fireEvent, render, screen } from '@testing-library/react'

import { TouchControls } from '../hud/TouchControls'
import { createTouchInput, mergeInputs } from '../input/touchInput'

describe('touch input', () => {
  test('createTouchInput clamps axes and reads back the shared state', () => {
    const handle = createTouchInput()
    handle.setStick(2, -3)
    handle.setJumpHeld(true)

    expect(handle.source.read()).toEqual({ thrust: -1, strafe: 1, turn: 0, lookPitch: 0, jumpHeld: true })

    handle.reset()
    expect(handle.source.read()).toEqual({ thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false })
  })

  test('mergeInputs combines keyboard and touch with clamping', () => {
    const merged = mergeInputs(
      { thrust: 1, strafe: 0.75, turn: -0.5, lookPitch: 0.5, jumpHeld: false },
      { thrust: 0.5, strafe: 0.5, turn: -1, lookPitch: 0.75, jumpHeld: true },
    )
    expect(merged).toEqual({ thrust: 1, strafe: 1, turn: -1, lookPitch: 1, jumpHeld: true })
  })

  test('joystick drag writes deadzoned axes and release recenters', () => {
    const handle = createTouchInput()
    render(<TouchControls handle={handle} onPause={jest.fn()} />)

    const stick = screen.getByTestId('touch-stick')
    stick.getBoundingClientRect = jest.fn(() => ({
      left: 0,
      top: 0,
      width: 128,
      height: 128,
      right: 128,
      bottom: 128,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }))
    stick.setPointerCapture = jest.fn()

    // Drag straight up from center to the travel limit: full thrust, no turn.
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 64, clientY: 64 })
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 64, clientY: 64 - 36 })

    const state = handle.source.read()
    expect(state.thrust).toBeCloseTo(1, 5)
    expect(state.strafe).toBe(0)
    expect(state.turn).toBe(0)
    expect(state.lookPitch).toBe(0)

    fireEvent.pointerUp(stick, { pointerId: 1 })
    expect(handle.source.read()).toEqual({ thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false })
  })

  test('dragging the playfield writes look axes and release recenters', () => {
    const handle = createTouchInput()
    render(<TouchControls handle={handle} onPause={jest.fn()} />)

    const surface = screen.getByTestId('touch-look-surface')
    surface.setPointerCapture = jest.fn()

    fireEvent.pointerDown(surface, { pointerId: 3, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(surface, { pointerId: 3, clientX: 104, clientY: 104 })

    expect(handle.source.read().turn).toBeCloseTo(1, 5)
    expect(handle.source.read().lookPitch).toBeCloseTo(1, 5)

    fireEvent.pointerUp(surface, { pointerId: 3 })
    expect(handle.source.read().turn).toBe(0)
    expect(handle.source.read().lookPitch).toBe(0)
  })

  test('jump button holds and releases jumpHeld', () => {
    const handle = createTouchInput()
    render(<TouchControls handle={handle} onPause={jest.fn()} />)

    const jump = screen.getByTestId('touch-jump')
    jump.setPointerCapture = jest.fn()

    fireEvent.pointerDown(jump, { pointerId: 2 })
    expect(handle.source.read().jumpHeld).toBe(true)

    fireEvent.pointerUp(jump, { pointerId: 2 })
    expect(handle.source.read().jumpHeld).toBe(false)
  })

  test('pause button fires onPause', () => {
    const handle = createTouchInput()
    const onPause = jest.fn()
    render(<TouchControls handle={handle} onPause={onPause} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })
})
