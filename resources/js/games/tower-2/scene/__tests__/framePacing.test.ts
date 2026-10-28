import { IDLE_FRAME_MS, INPUT_LINGER_MS, MAX_PIXEL_RATIO, pixelRatioFor, shouldRender } from '../framePacing'

describe('frame pacing', () => {
  test('renders every frame while hands are on the view or input was recent', () => {
    const clock = { lastRenderAt: 1000, lastInputAt: 0 }
    expect(shouldRender(clock, 1001, true)).toBe(true)
    expect(shouldRender({ lastRenderAt: 1000, lastInputAt: 1000 }, 1001 + INPUT_LINGER_MS / 2, false)).toBe(true)
  })

  test('drops to about 30 frames a second when idle', () => {
    const clock = { lastRenderAt: 1000, lastInputAt: 0 }
    // A 120 Hz display offers a frame every 8.3 ms; idle skips the next three.
    expect(shouldRender(clock, 1008.3, false)).toBe(false)
    expect(shouldRender(clock, 1025, false)).toBe(false)
    expect(shouldRender(clock, 1000 + IDLE_FRAME_MS, false)).toBe(true)
    // A 60 Hz display's second frame lands slightly early and still renders.
    expect(shouldRender(clock, 1000 + 2 * 16.4, false)).toBe(true)
  })

  test('caps the drawing pixel ratio', () => {
    expect(pixelRatioFor(3)).toBe(MAX_PIXEL_RATIO)
    expect(pixelRatioFor(2)).toBe(MAX_PIXEL_RATIO)
    expect(pixelRatioFor(1)).toBe(1)
    expect(pixelRatioFor(undefined)).toBe(1)
  })
})
