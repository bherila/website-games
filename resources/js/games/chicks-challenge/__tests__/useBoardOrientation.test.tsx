import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { BoardOrientationPreference } from '../input/orientation'
import { useBoardOrientation } from '../input/useBoardOrientation'

interface HarnessProps {
  cols: number
  rows: number
  levelId?: number | null
  preference?: BoardOrientationPreference
}

/** Exposes the hook's output as data attributes so the measurement wiring can be asserted in jsdom. */
function Harness({ cols, rows, levelId = 1, preference = 'auto' }: HarnessProps): ReactElement {
  const { areaRef, quarterTurns, box } = useBoardOrientation({ levelId, cols, rows, preference })

  return (
    <div
      data-box={box === null ? 'unmeasured' : `${box.width}x${box.height}`}
      data-testid="area"
      data-turns={quarterTurns}
      ref={areaRef}
    />
  )
}

function mockAreaBox(width: number, height: number): void {
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

function turns(): string | null {
  return screen.getByTestId('area').getAttribute('data-turns')
}

/**
 * jsdom has no `screen.orientation`, so the API is installed as a real EventTarget
 * carrying a mutable `angle` — which also lets the `change` event be dispatched.
 */
function mockScreenOrientation(angle: number): { setAngle: (next: number) => void } {
  const target = new EventTarget()
  const setAngle = (next: number): void => {
    Object.defineProperty(target, 'angle', { configurable: true, value: next })
  }
  setAngle(angle)
  Object.defineProperty(window.screen, 'orientation', { configurable: true, value: target })

  return {
    setAngle: (next: number): void => {
      setAngle(next)
      act(() => {
        target.dispatchEvent(new Event('change'))
      })
    },
  }
}

describe('useBoardOrientation', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(window, 'visualViewport')
    Reflect.deleteProperty(window.screen, 'orientation')
  })

  it('measures the board area on mount and rotates a tall board in a landscape box', () => {
    mockAreaBox(812, 300)

    render(<Harness cols={7} rows={13} />)

    expect(turns()).toBe('1')
    // Rotor box has the measured axes swapped so the canvas renders at the rotated aspect.
    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('300x812')
  })

  it('leaves a tall board upright in a portrait box and reports the measured box as-is', () => {
    mockAreaBox(375, 600)

    render(<Harness cols={7} rows={13} />)

    expect(turns()).toBe('0')
    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('375x600')
  })

  it('re-measures on a window resize and flips once the gain clears the margin', () => {
    mockAreaBox(1000, 1000)
    render(<Harness cols={10} rows={20} />)
    expect(turns()).toBe('0')

    mockAreaBox(1150, 1000)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(turns()).toBe('1')
  })

  it('keeps the rotation through a sub-margin resize of the same board (hysteresis)', () => {
    mockAreaBox(1150, 1000)
    render(<Harness cols={10} rows={20} />)
    expect(turns()).toBe('1')

    // 1.10x gain — inside the sticky band, so the board must not flip back.
    mockAreaBox(1100, 1000)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(turns()).toBe('1')

    // Upright now wins by 1.15x, which does clear the margin.
    mockAreaBox(1000, 1150)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(turns()).toBe('0')
  })

  it('decides a new level from upright instead of inheriting the previous board rotation', () => {
    mockAreaBox(812, 300)
    const { rerender } = render(<Harness cols={7} levelId={1} rows={13} />)
    expect(turns()).toBe('1')

    // Same landscape box, but a wide board: upright is now the better fit.
    rerender(<Harness cols={13} levelId={2} rows={7} />)
    expect(turns()).toBe('0')
  })

  it('decides a new level of identical dimensions from upright too', () => {
    // The case dimension-keyed hysteresis got wrong: same size, different level.
    mockAreaBox(1150, 1000)
    const { rerender } = render(<Harness cols={10} levelId={1} rows={20} />)
    expect(turns()).toBe('1')

    // 1.10x gain — inside the sticky band, so this level stays rotated...
    mockAreaBox(1100, 1000)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(turns()).toBe('1')

    // ...but the next level is a fresh decision, and 1.10x does not rotate.
    rerender(<Harness cols={10} levelId={2} rows={20} />)
    expect(turns()).toBe('0')
  })

  it('clears the hysteresis anchor on the way back to level select', () => {
    mockAreaBox(1150, 1000)
    const { rerender } = render(<Harness cols={10} levelId={1} rows={20} />)
    expect(turns()).toBe('1')

    mockAreaBox(1100, 1000)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(turns()).toBe('1')

    // Level select unloads the board; replaying the *same* level then decides fresh.
    rerender(<Harness cols={0} levelId={null} rows={0} />)
    rerender(<Harness cols={10} levelId={1} rows={20} />)
    expect(turns()).toBe('0')
  })

  it('falls back to a clockwise turn where screen.orientation is unavailable', () => {
    expect((window.screen as Screen | undefined)?.orientation).toBeUndefined()
    mockAreaBox(812, 300)

    render(<Harness cols={7} rows={13} />)

    expect(turns()).toBe('1')
  })

  it('turns the board counter-clockwise when the device is turned clockwise', () => {
    mockScreenOrientation(270)
    mockAreaBox(812, 300)

    render(<Harness cols={7} rows={13} />)

    expect(turns()).toBe('3')
    // The rotor box swaps axes for either direction.
    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('300x812')
  })

  it('turns the board clockwise when the device is turned counter-clockwise', () => {
    mockScreenOrientation(90)
    mockAreaBox(812, 300)

    render(<Harness cols={7} rows={13} />)

    expect(turns()).toBe('1')
  })

  it('re-turns a rotated board when the screen-orientation angle changes without a resize', () => {
    const orientation = mockScreenOrientation(90)
    mockAreaBox(812, 300)
    render(<Harness cols={7} rows={13} />)
    expect(turns()).toBe('1')

    orientation.setAngle(270)

    expect(turns()).toBe('3')
  })

  it('applies a manual preference over the measurement', () => {
    mockAreaBox(375, 600)
    const { rerender } = render(<Harness cols={7} rows={13} preference="rotated" />)
    expect(turns()).toBe('1')
    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('600x375')

    rerender(<Harness cols={7} rows={13} preference="upright" />)
    expect(turns()).toBe('0')
  })

  it('turns a manually rotated board the device-appropriate way', () => {
    mockScreenOrientation(270)
    mockAreaBox(375, 600)

    render(<Harness cols={7} rows={13} preference="rotated" />)

    expect(turns()).toBe('3')
    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('600x375')
  })

  it('clamps the measured box to the visual viewport so browser chrome is not counted', () => {
    mockAreaBox(375, 812)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { addEventListener: jest.fn(), height: 640, removeEventListener: jest.fn(), width: 375 },
    })

    render(<Harness cols={11} rows={11} />)

    expect(screen.getByTestId('area').getAttribute('data-box')).toBe('375x640')
  })

  it('stays unmeasured (and upright) when there is no level loaded', () => {
    mockAreaBox(812, 300)

    render(<Harness cols={0} rows={0} />)

    expect(turns()).toBe('0')
  })
})
