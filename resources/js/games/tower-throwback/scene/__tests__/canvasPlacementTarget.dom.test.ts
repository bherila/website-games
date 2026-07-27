import { clearCanvasPlacementTarget, setCanvasPlacementTarget } from '../canvasPlacementTarget'

describe('canvas placement target locator', () => {
  it('reports the exact tile consumed by the canvas placement seam', () => {
    const canvas = document.createElement('canvas')

    setCanvasPlacementTarget(canvas, { floor: -3, x: 187 })

    expect(canvas).toHaveAttribute('data-tower-target-floor', '-3')
    expect(canvas).toHaveAttribute('data-tower-target-x', '187')
  })

  it('clears stale coordinates when the pointer is outside the playable canvas', () => {
    const canvas = document.createElement('canvas')
    setCanvasPlacementTarget(canvas, { floor: 4, x: 20 })

    clearCanvasPlacementTarget(canvas)

    expect(canvas).not.toHaveAttribute('data-tower-target-floor')
    expect(canvas).not.toHaveAttribute('data-tower-target-x')
  })
})
