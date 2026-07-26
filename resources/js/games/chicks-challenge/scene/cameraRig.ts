/**
 * Pure orthographic fit-or-follow camera math for Chick's Challenge — no three.js, no
 * DOM. Tile (x, y) is centered at world (x + 0.5, -(y + 0.5)) so tile-row y
 * grows downward on screen (see ChicksScene.tsx / boardBuilder.ts). A
 * CameraView describes the visible world-space box in that same convention;
 * ChicksScene converts it to an OrthographicCamera's left/right/top/bottom.
 */

export interface Viewport {
  readonly width: number
  readonly height: number
}

export interface Vec2 {
  readonly x: number
  readonly y: number
}

export interface CameraView {
  readonly centerX: number
  readonly centerY: number
  readonly halfWidth: number
  readonly halfHeight: number
}

/** Per docs/games/chicks-challenge.md ("Camera fit"): whole-board static view requires at least this many px/tile. */
export const MIN_PX_PER_TILE = 32
/** Per docs/games/chicks-challenge.md: the follow camera always shows at least this many tiles across. */
export const MIN_TILES_ACROSS = 11

export function pxPerTileToFitBoard(viewport: Viewport, boardWidthTiles: number, boardHeightTiles: number): number {
  if (boardWidthTiles <= 0 || boardHeightTiles <= 0) {
    return 0
  }

  return Math.min(viewport.width / boardWidthTiles, viewport.height / boardHeightTiles)
}

/** Whether the whole board fits the viewport at >= MIN_PX_PER_TILE, i.e. the static centered-fit camera applies. */
export function chooseCameraMode(
  viewport: Viewport,
  boardWidthTiles: number,
  boardHeightTiles: number,
  minPxPerTile: number = MIN_PX_PER_TILE,
): 'fit' | 'follow' {
  return pxPerTileToFitBoard(viewport, boardWidthTiles, boardHeightTiles) >= minPxPerTile ? 'fit' : 'follow'
}

/** Static centered view showing the entire board, letterboxed to the viewport aspect ratio. */
export function fitCameraView(viewport: Viewport, boardWidthTiles: number, boardHeightTiles: number): CameraView {
  const viewportAspect = viewport.width / Math.max(1, viewport.height)
  const boardAspect = boardWidthTiles / Math.max(1, boardHeightTiles)

  let halfWidth: number
  let halfHeight: number
  if (viewportAspect > boardAspect) {
    halfHeight = boardHeightTiles / 2
    halfWidth = halfHeight * viewportAspect
  } else {
    halfWidth = boardWidthTiles / 2
    halfHeight = halfWidth / viewportAspect
  }

  return { centerX: boardWidthTiles / 2, centerY: -boardHeightTiles / 2, halfWidth, halfHeight }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Follow-camera view centered on `focus` (typically the player's tweened
 * world position), showing at least MIN_TILES_ACROSS tiles, clamped so the
 * visible box never runs past the board edges (falling back to centering on
 * that axis when the board itself is narrower than the view).
 */
export function followCameraView(
  viewport: Viewport,
  boardWidthTiles: number,
  boardHeightTiles: number,
  focus: Vec2,
  minTilesAcross: number = MIN_TILES_ACROSS,
): CameraView {
  const viewportAspect = viewport.width / Math.max(1, viewport.height)
  const halfWidth = minTilesAcross / 2
  const halfHeight = halfWidth / viewportAspect

  const minCenterX = halfWidth
  const maxCenterX = boardWidthTiles - halfWidth
  const centerX = minCenterX <= maxCenterX ? clamp(focus.x, minCenterX, maxCenterX) : boardWidthTiles / 2

  const minCenterY = -boardHeightTiles + halfHeight
  const maxCenterY = -halfHeight
  const centerY = minCenterY <= maxCenterY ? clamp(focus.y, minCenterY, maxCenterY) : -boardHeightTiles / 2

  return { centerX, centerY, halfWidth, halfHeight }
}

/** Picks fit-or-follow and returns the resulting target view in one call. */
export function computeCameraView(
  viewport: Viewport,
  boardWidthTiles: number,
  boardHeightTiles: number,
  focus: Vec2,
): CameraView {
  return chooseCameraMode(viewport, boardWidthTiles, boardHeightTiles) === 'fit'
    ? fitCameraView(viewport, boardWidthTiles, boardHeightTiles)
    : followCameraView(viewport, boardWidthTiles, boardHeightTiles, focus)
}

/**
 * Exponential-decay smoothing of `current` toward `target`; `smoothingPerSecond`
 * is the convergence rate (higher = snappier). Used to lerp the follow camera
 * frame-to-frame instead of jump-cutting to the target view.
 */
export function smoothCameraView(
  current: CameraView,
  target: CameraView,
  dtSeconds: number,
  smoothingPerSecond: number,
): CameraView {
  const t = clamp(1 - Math.exp(-smoothingPerSecond * Math.max(0, dtSeconds)), 0, 1)

  return {
    centerX: current.centerX + (target.centerX - current.centerX) * t,
    centerY: current.centerY + (target.centerY - current.centerY) * t,
    halfWidth: current.halfWidth + (target.halfWidth - current.halfWidth) * t,
    halfHeight: current.halfHeight + (target.halfHeight - current.halfHeight) * t,
  }
}

/** World-space center of tile (x, y) under the board's coordinate convention. */
export function tileCenterWorld(x: number, y: number): Vec2 {
  return { x: x + 0.5, y: -(y + 0.5) }
}
