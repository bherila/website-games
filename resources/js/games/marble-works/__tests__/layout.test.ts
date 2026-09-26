import { BOARD_MARGIN_CELLS, computeBoardLayout, orthoFrustum, screenToWorld, worldToScreen } from '../board/layout'

const BOARD = { cols: 6, rows: 8 }

describe('board layout', () => {
  it('contain-fits the board plus its frame margin and centres it', () => {
    const layout = computeBoardLayout(BOARD, 400, 600)
    const cellSize = Math.min(400 / (6 + (BOARD_MARGIN_CELLS * 2)), 600 / (8 + (BOARD_MARGIN_CELLS * 2)))

    expect(layout.cellSize).toBeCloseTo(cellSize)
    expect(layout.left).toBeCloseTo((400 - (6 * cellSize)) / 2)
    expect(layout.top).toBeCloseTo((600 - (8 * cellSize)) / 2)
  })

  it('round-trips screen and world coordinates', () => {
    const layout = computeBoardLayout(BOARD, 375, 500)
    const [x, y] = screenToWorld(BOARD, layout, 200, 300)
    const [sx, sy] = worldToScreen(BOARD, layout, x, y)

    expect(sx).toBeCloseTo(200)
    expect(sy).toBeCloseTo(300)
    expect(screenToWorld(BOARD, layout, layout.left, layout.top)).toEqual([0, 8])
  })

  it('builds a camera-relative orthographic frustum matching the pixel layout', () => {
    const layout = computeBoardLayout(BOARD, 300, 800)
    const frustum = orthoFrustum(layout)

    expect((frustum.right - frustum.left) * layout.cellSize).toBeCloseTo(300)
    expect((frustum.top - frustum.bottom) * layout.cellSize).toBeCloseTo(800)
    // Camera-relative: the camera itself sits over the board centre.
    expect(frustum.left + frustum.right).toBeCloseTo(0)
  })
})
