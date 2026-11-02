import { COLS, ROWS } from '../gameTypes'
import { CAMERA_TILT, frameBoard } from '../scene/boardCamera'

describe('frameBoard', () => {
  it.each([[375, 520], [390, 700], [820, 900], [1180, 620], [844, 240], [1703, 800]])('fits the whole %ix%i board on screen', (width, height) => {
    const frame = frameBoard(width, height)
    const across = frame.sideways ? ROWS : COLS
    const deep = (frame.sideways ? COLS : ROWS) * Math.cos(CAMERA_TILT)
    expect(across / frame.unitsPerPixel).toBeLessThanOrEqual(width)
    expect(deep / frame.unitsPerPixel).toBeLessThanOrEqual(height)
  })

  it('turns the long side across a wide screen and keeps cells comfortably tappable', () => {
    expect(frameBoard(375, 520).sideways).toBe(false)
    const landscape = frameBoard(1180, 620)
    expect(landscape.sideways).toBe(true)
    expect(1 / landscape.unitsPerPixel).toBeGreaterThan(44)
    expect(1 / frameBoard(375, 520).unitsPerPixel).toBeGreaterThan(25)
  })
})
