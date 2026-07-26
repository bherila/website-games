import {
  MAX_WHEEL_ZOOM_STEP,
  normalizeWheelPx,
  pinchSnapshot,
  pinchUpdate,
  wheelPanDelta,
  wheelZoomFactor,
} from '../touchGestures'

describe('pinchSnapshot', () => {
  it('reports the midpoint and finger spread', () => {
    const snap = pinchSnapshot({ x: 0, y: 0 }, { x: 40, y: 30 })
    expect(snap.midX).toBe(20)
    expect(snap.midY).toBe(15)
    expect(snap.dist).toBeCloseTo(50) // 3-4-5 triangle × 10
  })
})

describe('pinchUpdate', () => {
  it('spreading the fingers zooms in (factor < 1)', () => {
    const prev = pinchSnapshot({ x: 90, y: 0 }, { x: 110, y: 0 }) // dist 20
    const next = pinchSnapshot({ x: 80, y: 0 }, { x: 120, y: 0 }) // dist 40
    const update = pinchUpdate(prev, next)
    expect(update.zoomFactor).toBeCloseTo(0.5)
  })

  it('pinching the fingers together zooms out (factor > 1)', () => {
    const prev = pinchSnapshot({ x: 80, y: 0 }, { x: 120, y: 0 }) // dist 40
    const next = pinchSnapshot({ x: 90, y: 0 }, { x: 110, y: 0 }) // dist 20
    expect(pinchUpdate(prev, next).zoomFactor).toBeCloseTo(2)
  })

  it('drags the view under the fingers (grab-and-drag pan sign)', () => {
    const prev = pinchSnapshot({ x: 100, y: 100 }, { x: 200, y: 100 }) // mid (150,100)
    const next = pinchSnapshot({ x: 110, y: 120 }, { x: 210, y: 120 }) // mid (160,120)
    const update = pinchUpdate(prev, next)
    // fingers moved +10 right → view shifts left (negative dx); +20 down → dy positive
    expect(update.panDxPx).toBe(-10)
    expect(update.panDyPx).toBe(20)
    expect(update.focusX).toBe(160)
    expect(update.focusY).toBe(120)
  })

  it('holds the zoom when a snapshot is degenerate (zero distance)', () => {
    const zero = pinchSnapshot({ x: 5, y: 5 }, { x: 5, y: 5 })
    const real = pinchSnapshot({ x: 0, y: 0 }, { x: 40, y: 0 })
    expect(pinchUpdate(zero, real).zoomFactor).toBe(1)
    expect(pinchUpdate(real, zero).zoomFactor).toBe(1)
  })
})

describe('normalizeWheelPx', () => {
  it('passes pixel deltas through unchanged (deltaMode 0)', () => {
    expect(normalizeWheelPx(100, 0, 800)).toBe(100)
  })

  it('scales line deltas to pixels (deltaMode 1)', () => {
    expect(normalizeWheelPx(3, 1, 800)).toBe(48)
  })

  it('scales page deltas by the page size (deltaMode 2)', () => {
    expect(normalizeWheelPx(1, 2, 640)).toBe(640)
  })
})

describe('wheelPanDelta', () => {
  it('scrolling down/right moves the view down/right (page-scroll convention)', () => {
    const { panDxPx, panDyPx } = wheelPanDelta(30, 50)
    expect(panDxPx).toBe(30) // scroll right → view right
    expect(panDyPx).toBe(-50) // scroll down (deltaY>0) → view down (panBy dy<0)
  })
})

describe('wheelZoomFactor', () => {
  it('pinching apart (deltaY < 0) zooms in', () => {
    expect(wheelZoomFactor(-10)).toBeLessThan(1)
  })

  it('pinching together (deltaY > 0) zooms out', () => {
    expect(wheelZoomFactor(10)).toBeGreaterThan(1)
  })

  it('clamps a large single event to the per-step bound', () => {
    expect(wheelZoomFactor(1000)).toBe(MAX_WHEEL_ZOOM_STEP)
    expect(wheelZoomFactor(-1000)).toBe(1 / MAX_WHEEL_ZOOM_STEP)
  })
})
