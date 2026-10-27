/**
 * The view as plain data (zoom, quarter-turn rotation, pan), and the three.js
 * orthographic camera derived from it. Picking goes through isoProjection with
 * the same parameters, so the tile under the cursor is the tile drawn there.
 *
 * three.js axes: x = tile x, y = height (floor × FLOOR_HEIGHT), z = tile y.
 */
import * as THREE from 'three'

import { createIsoProjection, type FloorPoint, type Point2, type QuarterTurn } from './isoProjection'

/** Storey height in tile widths (a 3 m tile, a 3.75 m storey). */
export const FLOOR_HEIGHT = 1.25
export const MIN_ZOOM = 6
export const MAX_ZOOM = 90

export interface IsoView {
  /** CSS pixels per tile. */
  zoom: number
  rotation: QuarterTurn
  /** Screen position (CSS px) of world (0, 0) on floor 0. */
  origin: Point2
}

export interface Viewport {
  width: number
  height: number
}

export function projectionFor(view: IsoView) {
  return createIsoProjection({ tileSize: 1, floorHeight: FLOOR_HEIGHT, zoom: view.zoom, rotation: view.rotation, origin: view.origin })
}

function withOrigin(view: IsoView, origin: Point2): IsoView {
  return { ...view, origin: { x: origin.x, y: origin.y } }
}

/** The origin that puts `world` at `screen`, keeping zoom and rotation. */
function anchor(view: IsoView, world: FloorPoint, screen: Point2): IsoView {
  const at = projectionFor(withOrigin(view, { x: 0, y: 0 })).tileToScreen(world)
  return withOrigin(view, { x: screen.x - at.x, y: screen.y - at.y })
}

/** Centre `rect` (in tiles, on `floor`) in the viewport at a zoom that fits it. */
export function frameRect(viewport: Viewport, rect: { x: number, y: number, width: number, depth: number }, floor: number, rotation: QuarterTurn = 0): IsoView {
  const unit = projectionFor({ zoom: 1, rotation, origin: { x: 0, y: 0 } }).floorBounds({ ...rect, floor })
  const zoom = clampZoom(Math.min(viewport.width / Math.max(unit.width, 1e-6), viewport.height / Math.max(unit.height, 1e-6)) * 0.8)
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.depth / 2, floor }
  return anchor({ zoom, rotation, origin: { x: 0, y: 0 } }, centre, { x: viewport.width / 2, y: viewport.height / 2 })
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Drag the scene with the pointer: the content moves by the same pixels. */
export function panView(view: IsoView, dx: number, dy: number): IsoView {
  return withOrigin(view, { x: view.origin.x + dx, y: view.origin.y + dy })
}

/** Zoom by `factor` (>1 zooms in) keeping the point under `screen` on `floor` fixed. */
export function zoomViewAt(view: IsoView, factor: number, screen: Point2, floor: number): IsoView {
  const world = projectionFor(view).screenToFloor(screen, floor)
  return anchor({ ...view, zoom: clampZoom(view.zoom * factor) }, world, screen)
}

/** Turn the view a quarter at a time about the point at the viewport centre on `floor`. */
export function rotateView(view: IsoView, turns: number, viewport: Viewport, floor: number): IsoView {
  const centre = { x: viewport.width / 2, y: viewport.height / 2 }
  const world = projectionFor(view).screenToFloor(centre, floor)
  const rotation = ((((view.rotation + turns) % 4) + 4) % 4) as QuarterTurn
  return anchor({ ...view, rotation }, world, centre)
}

/** Keep the active floor where it was on screen when stepping between floors. */
export function followFloor(view: IsoView, fromFloor: number, toFloor: number, viewport: Viewport): IsoView {
  const centre = { x: viewport.width / 2, y: viewport.height / 2 }
  const world = projectionFor(view).screenToFloor(centre, fromFloor)
  return anchor(view, { ...world, floor: toFloor }, centre)
}

/** Position, target and frustum for a THREE.OrthographicCamera matching `projectionFor(view)`. */
export function cameraPose(view: IsoView, viewport: Viewport) {
  const projection = projectionFor(view)
  const target = projection.screenToFloor({ x: viewport.width / 2, y: viewport.height / 2 }, 0)
  // The camera looks along view (−1, −1, −1); undo the view rotation to find that in world axes.
  const inverse = (4 - view.rotation) % 4
  const turn = [[1, 1], [-1, 1], [-1, -1], [1, -1]][inverse]!
  const distance = 400
  const scale = distance / Math.sqrt(3)
  return {
    target: new THREE.Vector3(target.x, 0, target.y),
    position: new THREE.Vector3(target.x + turn[0]! * scale, scale, target.y + turn[1]! * scale),
    halfWidth: viewport.width / 2 / view.zoom,
    halfHeight: viewport.height / 2 / view.zoom,
    near: 1,
    far: distance * 2,
  }
}

export function applyCamera(camera: THREE.OrthographicCamera, view: IsoView, viewport: Viewport): void {
  const pose = cameraPose(view, viewport)
  camera.left = -pose.halfWidth
  camera.right = pose.halfWidth
  camera.top = pose.halfHeight
  camera.bottom = -pose.halfHeight
  camera.near = pose.near
  camera.far = pose.far
  camera.position.copy(pose.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(pose.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** World tile coordinates on a floor as a three.js position. */
export function toScene(x: number, y: number, floor: number): THREE.Vector3 {
  return new THREE.Vector3(x, floor * FLOOR_HEIGHT, y)
}
