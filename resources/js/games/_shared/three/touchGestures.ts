/**
 * Pure geometry for two-finger (pinch/pan) and wheel gestures. Kept framework-
 * free — no canvas, no Three.js — so the sign conventions can be unit-tested in
 * isolation. TowerScene feeds these results into SceneController.zoomBy /
 * panBy, whose conventions are:
 *   - panBy(dxPx, dyPx): dxPx>0 moves the view right, dyPx>0 moves it up
 *     (this mirrors the existing pointer-drag `lastPointer.x - e.clientX`,
 *     `e.clientY - lastPointer.y` grab-and-drag feel).
 *   - zoomBy(factor): factor>1 zooms OUT (halfHeight grows), <1 zooms IN.
 */

export interface TouchPoint {
  x: number
  y: number
}

export interface PinchSnapshot {
  /** Midpoint between the two active pointers, in client pixels. */
  midX: number
  midY: number
  /** Distance between the two pointers, in client pixels. */
  dist: number
}

export interface PinchUpdate {
  /** Multiply the camera halfHeight by this (>1 zooms out) — matches zoomBy. */
  zoomFactor: number
  /** Pan deltas in the sign convention SceneController.panBy expects. */
  panDxPx: number
  panDyPx: number
  /** Zoom focus in client pixels; subtract the canvas rect before screenToWorld. */
  focusX: number
  focusY: number
}

/** Midpoint + finger spread for a two-pointer gesture frame. */
export function pinchSnapshot(a: TouchPoint, b: TouchPoint): PinchSnapshot {
  return {
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
    dist: Math.hypot(a.x - b.x, a.y - b.y),
  }
}

/**
 * Frame-to-frame gesture delta. Spreading the fingers (dist grows) yields a
 * factor < 1 (zoom in); moving the midpoint drags the view under the fingers.
 * A degenerate zero distance holds the zoom (factor 1) rather than dividing by
 * zero.
 */
export function pinchUpdate(prev: PinchSnapshot, next: PinchSnapshot): PinchUpdate {
  const zoomFactor = prev.dist > 0 && next.dist > 0 ? prev.dist / next.dist : 1
  return {
    zoomFactor,
    panDxPx: prev.midX - next.midX,
    panDyPx: next.midY - prev.midY,
    focusX: next.midX,
    focusY: next.midY,
  }
}

const LINE_HEIGHT_PX = 16

/**
 * Normalise a WheelEvent delta to pixels. Chrome/Safari report pixel deltas
 * (deltaMode 0); Firefox reports lines (1) and, rarely, pages (2). Without this
 * a line-mode wheel would pan only a few pixels per notch.
 */
export function normalizeWheelPx(delta: number, deltaMode: number, pagePx: number): number {
  if (deltaMode === 1) {
    return delta * LINE_HEIGHT_PX
  }
  if (deltaMode === 2) {
    return delta * pagePx
  }
  return delta
}

/**
 * Plain wheel / trackpad two-finger scroll → pan, using the page-scroll
 * convention (scroll down reveals lower content, scroll right reveals content
 * to the right). Deltas are expected already normalised to pixels.
 */
export function wheelPanDelta(deltaXPx: number, deltaYPx: number): { panDxPx: number; panDyPx: number } {
  return { panDxPx: deltaXPx, panDyPx: -deltaYPx }
}

/** Upper/lower bound on a single wheel/pinch zoom step so one event can't jump the view. */
export const MAX_WHEEL_ZOOM_STEP = 2

/**
 * ctrl+wheel / trackpad pinch → zoom factor (>1 zooms out), clamped per event.
 * Pinching apart (deltaY < 0) zooms in; pinching together zooms out.
 */
export function wheelZoomFactor(deltaYPx: number, sensitivity = 0.01): number {
  const factor = Math.exp(deltaYPx * sensitivity)
  return Math.min(Math.max(factor, 1 / MAX_WHEEL_ZOOM_STEP), MAX_WHEEL_ZOOM_STEP)
}
