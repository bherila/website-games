import {
  chooseCameraMode,
  fitCameraView,
  followCameraView,
  MIN_PX_PER_TILE,
  MIN_TILES_ACROSS,
  pxPerTileToFitBoard,
  smoothCameraView,
  tileCenterWorld,
} from '../scene/cameraRig'

describe('pxPerTileToFitBoard / chooseCameraMode', () => {
  it('picks fit when the whole board comfortably meets the px/tile floor', () => {
    // 11x11 board in a 400x400 viewport => ~36 px/tile, above the 32 px floor.
    expect(pxPerTileToFitBoard({ width: 400, height: 400 }, 11, 11)).toBeCloseTo(400 / 11)
    expect(chooseCameraMode({ width: 400, height: 400 }, 11, 11)).toBe('fit')
  })

  it('picks follow when the board cannot fit at the px/tile floor', () => {
    // 32x32 board in a 400x400 viewport => 12.5 px/tile, well under the floor.
    expect(chooseCameraMode({ width: 400, height: 400 }, 32, 32)).toBe('follow')
  })

  it('is exactly on the boundary at MIN_PX_PER_TILE', () => {
    const viewport = { width: MIN_PX_PER_TILE * 10, height: MIN_PX_PER_TILE * 10 }
    expect(chooseCameraMode(viewport, 10, 10)).toBe('fit')
    expect(chooseCameraMode({ width: viewport.width - 1, height: viewport.height }, 10, 10)).toBe('follow')
  })
})

describe('fitCameraView', () => {
  it('centers the board and matches board half-extents when aspect ratios agree', () => {
    const view = fitCameraView({ width: 400, height: 400 }, 10, 10)
    expect(view.centerX).toBeCloseTo(5)
    expect(view.centerY).toBeCloseTo(-5)
    expect(view.halfWidth).toBeCloseTo(5)
    expect(view.halfHeight).toBeCloseTo(5)
  })

  it('letterboxes on the wide axis when the viewport is wider than the board', () => {
    // Viewport is 2x as wide as tall; a square board should grow halfWidth to match.
    const view = fitCameraView({ width: 800, height: 400 }, 10, 10)
    expect(view.halfHeight).toBeCloseTo(5)
    expect(view.halfWidth).toBeCloseTo(10)
  })

  it('letterboxes on the tall axis when the viewport is taller than the board', () => {
    const view = fitCameraView({ width: 400, height: 800 }, 10, 10)
    expect(view.halfWidth).toBeCloseTo(5)
    expect(view.halfHeight).toBeCloseTo(10)
  })
})

describe('followCameraView', () => {
  const viewport = { width: 400, height: 400 }

  it('centers on the focus point when far from any edge', () => {
    const view = followCameraView(viewport, 40, 40, { x: 20, y: -20 }, MIN_TILES_ACROSS)
    expect(view.centerX).toBeCloseTo(20)
    expect(view.centerY).toBeCloseTo(-20)
    expect(view.halfWidth).toBeCloseTo(MIN_TILES_ACROSS / 2)
  })

  it('clamps to the left/top board edge instead of showing out-of-bounds space', () => {
    const view = followCameraView(viewport, 40, 40, { x: -100, y: 100 }, MIN_TILES_ACROSS)
    expect(view.centerX).toBeCloseTo(view.halfWidth)
    expect(view.centerY).toBeCloseTo(-view.halfHeight)
  })

  it('clamps to the right/bottom board edge instead of showing out-of-bounds space', () => {
    const view = followCameraView(viewport, 40, 40, { x: 1000, y: -1000 }, MIN_TILES_ACROSS)
    expect(view.centerX).toBeCloseTo(40 - view.halfWidth)
    expect(view.centerY).toBeCloseTo(-(40 - view.halfHeight))
  })

  it('shows at least MIN_TILES_ACROSS tiles across regardless of focus', () => {
    const view = followCameraView(viewport, 100, 100, { x: 50, y: -50 })
    expect(view.halfWidth * 2).toBeGreaterThanOrEqual(MIN_TILES_ACROSS - 1e-9)
  })

  it('falls back to centering on an axis when the board is narrower than the view', () => {
    // A 4-wide board can never satisfy an 11-tile-wide view without clamping degenerately;
    // the fallback centers the board on that axis instead of producing an inverted clamp.
    const view = followCameraView(viewport, 4, 40, { x: 2, y: -20 }, MIN_TILES_ACROSS)
    expect(view.centerX).toBeCloseTo(2)
  })
})

describe('smoothCameraView', () => {
  const target = { centerX: 10, centerY: -10, halfWidth: 6, halfHeight: 6 }

  it('does not move at dt=0', () => {
    const current = { centerX: 0, centerY: 0, halfWidth: 5, halfHeight: 5 }
    const result = smoothCameraView(current, target, 0, 8)
    expect(result).toEqual(current)
  })

  it('converges monotonically toward the target as elapsed time grows', () => {
    let current = { centerX: 0, centerY: 0, halfWidth: 5, halfHeight: 5 }
    const distanceToTarget = (view: typeof current): number => Math.hypot(view.centerX - target.centerX, view.centerY - target.centerY)

    let previousDistance = distanceToTarget(current)
    for (let i = 0; i < 20; i += 1) {
      current = smoothCameraView(current, target, 1 / 60, 8)
      const distance = distanceToTarget(current)
      expect(distance).toBeLessThanOrEqual(previousDistance + 1e-9)
      previousDistance = distance
    }
  })

  it('essentially snaps to the target after a long elapsed time', () => {
    const current = { centerX: 0, centerY: 0, halfWidth: 5, halfHeight: 5 }
    const result = smoothCameraView(current, target, 10, 8)
    expect(result.centerX).toBeCloseTo(target.centerX, 3)
    expect(result.centerY).toBeCloseTo(target.centerY, 3)
  })
})

describe('tileCenterWorld', () => {
  it('centers tile (0,0) at (0.5, -0.5) so row y grows downward on screen', () => {
    expect(tileCenterWorld(0, 0)).toEqual({ x: 0.5, y: -0.5 })
  })

  it('centers tile (2,3) at (2.5, -3.5)', () => {
    expect(tileCenterWorld(2, 3)).toEqual({ x: 2.5, y: -3.5 })
  })
})
