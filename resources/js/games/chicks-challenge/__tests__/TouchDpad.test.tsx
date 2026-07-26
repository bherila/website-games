import { fireEvent, render, screen } from '@testing-library/react'

import { INPUT_REPEAT_MS } from '../gameTypes'
import { TouchDpad } from '../hud/TouchDpad'

/** jsdom doesn't implement the Pointer Events capture API; stub it per house convention (see hover/__tests__/touchInput.dom.test.tsx). */
function stubPointerCapture(element: HTMLElement): void {
  element.setPointerCapture = jest.fn()
  element.releasePointerCapture = jest.fn()
  element.hasPointerCapture = jest.fn(() => true)
}

describe('TouchDpad', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders all five direction buttons at >=48px with accessible labels', () => {
    render(<TouchDpad onIntent={jest.fn()} />)

    for (const [intent, label] of [
      ['up', 'Step up'],
      ['down', 'Step down'],
      ['left', 'Step left'],
      ['right', 'Step right'],
      ['wait', 'Wait'],
    ] as const) {
      const button = screen.getByTestId(`touch-dpad-${intent}`)
      expect(button).toHaveAccessibleName(label)
      expect(button.className).toMatch(/size-12/)
    }
  })

  it('fires the intent immediately on press', () => {
    const onIntent = jest.fn()
    render(<TouchDpad onIntent={onIntent} />)

    const up = screen.getByTestId('touch-dpad-up')
    stubPointerCapture(up)
    fireEvent.pointerDown(up, { pointerId: 1 })

    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith('up')
  })

  it('auto-repeats at the keyboard cadence while held', () => {
    const onIntent = jest.fn()
    render(<TouchDpad onIntent={onIntent} />)

    const right = screen.getByTestId('touch-dpad-right')
    stubPointerCapture(right)
    fireEvent.pointerDown(right, { pointerId: 1 })
    expect(onIntent).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(INPUT_REPEAT_MS * 3)
    expect(onIntent).toHaveBeenCalledTimes(4)
  })

  it('stops repeating and releases pointer capture on release', () => {
    const onIntent = jest.fn()
    render(<TouchDpad onIntent={onIntent} />)

    const down = screen.getByTestId('touch-dpad-down')
    stubPointerCapture(down)
    fireEvent.pointerDown(down, { pointerId: 1 })
    fireEvent.pointerUp(down, { pointerId: 1 })

    jest.advanceTimersByTime(INPUT_REPEAT_MS * 3)

    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(down.releasePointerCapture).toHaveBeenCalledTimes(1)
  })

  it('stops repeating and releases pointer capture on cancel', () => {
    const onIntent = jest.fn()
    render(<TouchDpad onIntent={onIntent} />)

    const left = screen.getByTestId('touch-dpad-left')
    stubPointerCapture(left)
    fireEvent.pointerDown(left, { pointerId: 1 })
    fireEvent.pointerCancel(left, { pointerId: 1 })

    jest.advanceTimersByTime(INPUT_REPEAT_MS * 3)

    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(left.releasePointerCapture).toHaveBeenCalledTimes(1)
  })

  it('does not throw releasing capture it never held', () => {
    const onIntent = jest.fn()
    render(<TouchDpad onIntent={onIntent} />)

    const wait = screen.getByTestId('touch-dpad-wait')
    wait.setPointerCapture = jest.fn()
    wait.releasePointerCapture = jest.fn()
    wait.hasPointerCapture = jest.fn(() => false)

    fireEvent.pointerDown(wait, { pointerId: 1 })
    expect(() => fireEvent.pointerUp(wait, { pointerId: 1 })).not.toThrow()
    expect(wait.releasePointerCapture).not.toHaveBeenCalled()
  })
})
