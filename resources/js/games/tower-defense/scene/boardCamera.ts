import { COLS, ROWS } from '../gameTypes'

/** Radians the camera leans back from straight down. */
export const CAMERA_TILT = (32 * Math.PI) / 180
/** Room around the board, in cells, for the keep's towers and the rim. */
const MARGIN_CELLS = 0.7
const HEADROOM_CELLS = 1.6

export interface BoardFrame {
  /** World units per CSS pixel. */
  unitsPerPixel: number
  /** Long side of the board runs across the screen. */
  sideways: boolean
  /** Unit vector from the board's centre toward the camera. */
  direction: { x: number; y: number; z: number }
  /** How far the view is shifted up the screen, in world units, to leave room for tall models. */
  liftUnits: number
}

/**
 * Fits the whole board to the container. A wide container turns the camera a quarter turn
 * instead of the map, so the same map fills a phone in portrait and an iPad in landscape.
 */
export function frameBoard(width: number, height: number): BoardFrame {
  const sideways = width > height
  const across = (sideways ? ROWS : COLS) + (MARGIN_CELLS * 2)
  const deep = (sideways ? COLS : ROWS) + (MARGIN_CELLS * 2)
  const screenDepth = (deep * Math.cos(CAMERA_TILT)) + (HEADROOM_CELLS * Math.sin(CAMERA_TILT))
  const unitsPerPixel = Math.max(across / Math.max(1, width), screenDepth / Math.max(1, height))
  const azimuth = sideways ? Math.PI / 2 : 0

  return {
    unitsPerPixel,
    sideways,
    direction: {
      x: Math.sin(azimuth) * Math.sin(CAMERA_TILT),
      y: Math.cos(CAMERA_TILT),
      z: Math.cos(azimuth) * Math.sin(CAMERA_TILT),
    },
    liftUnits: (HEADROOM_CELLS * Math.sin(CAMERA_TILT)) / 2,
  }
}
