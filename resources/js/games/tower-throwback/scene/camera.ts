/**
 * Orthographic camera rig — pan/zoom over the tower cross-section with
 * clamping to the built extents (cached by structureVersion). Zoom is bounded
 * between whole-tower-fit and about three floors tall.
 */

import * as THREE from 'three'

import { shaftDef } from '../engine/catalog'
import { getMap } from '../engine/maps'
import type { EngineState } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import { FLOOR_H } from './palette'

const MIN_HALF_HEIGHT = 1.5 * FLOOR_H
const EXTENT_MARGIN = 4 * FLOOR_H
const EMPTY_HALF_HEIGHT = 12 * FLOOR_H

interface Extents {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface CameraRig {
  camera: THREE.OrthographicCamera
  aspect: number
  centerX: number
  centerY: number
  halfHeight: number
  extents: Extents
  extentsVersion: number
  /**
   * `structureVersion` is restored from the save, so two different maps can
   * present the same version. Extents are map-relative (they fall back to the
   * map's `floorRange`), so the map id has to gate the cache alongside it.
   */
  extentsMapId: string | null
}

export interface CameraViewport {
  centerFloor: number
  maxFloor: number
  minFloor: number
}

function applyFrustum(rig: CameraRig): void {
  const halfWidth = rig.halfHeight * rig.aspect
  rig.camera.left = rig.centerX - halfWidth
  rig.camera.right = rig.centerX + halfWidth
  rig.camera.top = rig.centerY + rig.halfHeight
  rig.camera.bottom = rig.centerY - rig.halfHeight
  rig.camera.updateProjectionMatrix()
}

export function createCameraRig(aspect: number): CameraRig {
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -50, 50)
  camera.position.z = 10
  const rig: CameraRig = {
    camera,
    aspect,
    centerX: GRID_WIDTH / 2,
    centerY: 6 * FLOOR_H,
    halfHeight: EMPTY_HALF_HEIGHT,
    extents: {
      minX: GRID_WIDTH / 2 - 40,
      maxX: GRID_WIDTH / 2 + 40,
      minY: -2 * FLOOR_H,
      maxY: 14 * FLOOR_H,
    },
    extentsVersion: -1,
    extentsMapId: null,
  }
  applyFrustum(rig)
  return rig
}

function computeExtents(state: EngineState): Extents {
  let minX = Infinity
  let maxX = -Infinity
  let minFloor = Infinity
  let maxFloor = -Infinity
  for (const unit of state.units) {
    minX = Math.min(minX, unit.x)
    maxX = Math.max(maxX, unit.x + unit.width)
    minFloor = Math.min(minFloor, unit.floor)
    maxFloor = Math.max(maxFloor, unit.floor + unit.storeys)
  }
  for (const shaft of state.shafts) {
    minX = Math.min(minX, shaft.x)
    maxX = Math.max(maxX, shaft.x + shaftDef(shaft.kind).width)
    minFloor = Math.min(minFloor, shaft.bottomFloor)
    maxFloor = Math.max(maxFloor, shaft.topFloor + 1)
  }
  if (minX === Infinity) {
    const floorRange = getMap(state.mapId).floorRange
    return {
      minX: GRID_WIDTH / 2 - 40,
      maxX: GRID_WIDTH / 2 + 40,
      minY: floorRange.min * FLOOR_H - EXTENT_MARGIN,
      maxY: (floorRange.max + 1) * FLOOR_H + EXTENT_MARGIN,
    }
  }
  return {
    minX: minX - EXTENT_MARGIN,
    maxX: maxX + EXTENT_MARGIN,
    minY: minFloor * FLOOR_H - EXTENT_MARGIN,
    maxY: maxFloor * FLOOR_H + EXTENT_MARGIN,
  }
}

function maxHalfHeight(rig: CameraRig): number {
  const fitHeight = (rig.extents.maxY - rig.extents.minY) / 2
  const fitWidth = (rig.extents.maxX - rig.extents.minX) / 2 / rig.aspect
  return Math.max(MIN_HALF_HEIGHT, Math.max(fitHeight, fitWidth))
}

function clampView(rig: CameraRig): void {
  rig.halfHeight = Math.min(Math.max(rig.halfHeight, MIN_HALF_HEIGHT), maxHalfHeight(rig))
  const halfWidth = rig.halfHeight * rig.aspect
  const { minX, maxX, minY, maxY } = rig.extents
  const spanX = maxX - minX
  const spanY = maxY - minY
  rig.centerX =
    spanX <= halfWidth * 2
      ? (minX + maxX) / 2
      : Math.min(Math.max(rig.centerX, minX + halfWidth), maxX - halfWidth)
  rig.centerY =
    spanY <= rig.halfHeight * 2
      ? (minY + maxY) / 2
      : Math.min(Math.max(rig.centerY, minY + rig.halfHeight), maxY - rig.halfHeight)
  applyFrustum(rig)
}

/** Pan in world units, clamped to built extents plus margin. */
export function panBy(rig: CameraRig, dx: number, dy: number): void {
  rig.centerX += dx
  rig.centerY += dy
  clampView(rig)
}

/**
 * Pan by a POINTER drag: pixel deltas convert through the same world-per-pixel
 * scale screenToTile uses (frustum height / viewport height; the horizontal
 * scale is identical because the rig aspect tracks the viewport).
 */
export function panByPixels(rig: CameraRig, dxPx: number, dyPx: number, viewportHeight: number): void {
  const worldPerPixel = (2 * rig.halfHeight) / Math.max(1, viewportHeight)
  panBy(rig, dxPx * worldPerPixel, dyPx * worldPerPixel)
}

/** Zoom by a factor (>1 zooms out); an optional focus point stays put on screen. */
export function zoomBy(rig: CameraRig, factor: number, focusPoint?: { x: number; y: number }): void {
  const before = rig.halfHeight
  rig.halfHeight = Math.min(Math.max(rig.halfHeight * factor, MIN_HALF_HEIGHT), maxHalfHeight(rig))
  if (focusPoint) {
    const applied = rig.halfHeight / before
    rig.centerX = focusPoint.x + (rig.centerX - focusPoint.x) * applied
    rig.centerY = focusPoint.y + (rig.centerY - focusPoint.y) * applied
  }
  clampView(rig)
}

export function updateAspect(rig: CameraRig, aspect: number): void {
  rig.aspect = aspect
  clampView(rig)
}

/**
 * Zoom out to the whole built tower. `maxHalfHeight` already IS the fit height
 * (it is what bounds manual zoom-out), so this asks for more than the maximum
 * and lets `clampView` settle on exactly the fit — no separate fit maths that
 * could disagree with the zoom clamp.
 */
export function fitAll(rig: CameraRig): void {
  rig.halfHeight = Number.POSITIVE_INFINITY
  rig.centerX = (rig.extents.minX + rig.extents.maxX) / 2
  rig.centerY = (rig.extents.minY + rig.extents.maxY) / 2
  clampView(rig)
}

/**
 * Center a floor without changing zoom, then clamp exactly like manual panning.
 *
 * Bounded by the MAP's playable range, not the grid's storage range. The grid
 * spans every map's extremes at once, so clamping to it would let the camera
 * fly into floors this map can never contain.
 */
export function goToFloor(rig: CameraRig, floor: number, range: { min: number; max: number } = { min: FLOOR_MIN, max: FLOOR_MAX }): void {
  const targetFloor = Math.min(range.max, Math.max(range.min, floor))
  rig.centerY = (targetFloor + 0.5) * FLOOR_H
  clampView(rig)
}

/** Current vertical camera footprint expressed in floor coordinates. */
export function cameraViewport(rig: CameraRig): CameraViewport {
  return {
    centerFloor: rig.centerY / FLOOR_H - 0.5,
    minFloor: rig.camera.bottom / FLOOR_H,
    maxFloor: rig.camera.top / FLOOR_H,
  }
}

/** Refresh extents when the structure changed, then re-clamp the view. */
export function clampToState(rig: CameraRig, state: EngineState): void {
  if (rig.extentsVersion !== state.structureVersion || rig.extentsMapId !== state.mapId) {
    rig.extentsVersion = state.structureVersion
    rig.extentsMapId = state.mapId
    rig.extents = computeExtents(state)
  }
  clampView(rig)
}
