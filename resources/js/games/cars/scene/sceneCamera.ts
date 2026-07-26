import * as THREE from 'three'

import { type GameState, getCarCells } from '../gameEngine'
import {
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  CELL_SIZE,
  FIELD_Z,
  PARKING_Z,
  QUEUE_Z,
} from './sceneConstants'
import {
  feederCurve,
  parkingSlotPosition,
  queueLayoutForState,
} from './sceneGeometry'
import type { MovingCarRenderItem } from './sceneTypes'

export interface SceneFitBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FitCameraOptions {
  camera: THREE.PerspectiveCamera
  width: number
  height: number
  bounds: SceneFitBounds
  topPaddingPx?: number
  bottomPaddingPx?: number
  sidePaddingPx?: number
}

const CAMERA_FOV_DEGREES = 42
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 200
const FEEDER_CURVE_SAMPLES = 8
const FEEDER_BOUNDS_T_MAX = 0.58
const BOUNDS_PADDING = CELL_SIZE * 0.45
/** Sparse layouts still get some lot around the cars instead of an extreme close-up. */
const MIN_CLUSTER_SPAN = CELL_SIZE * 6
const FIT_MIN_DISTANCE = 1
const FIT_MAX_DISTANCE = 120
const FIT_ITERATIONS = 24

// Match the legacy "look down and forward" view angle: camera previously sat at
// (0, 21, 5.4) looking toward (0, 0, -3.6), which gives a delta of (0, -21, -9).
const LOOK_DIRECTION = new THREE.Vector3(0, -21, -9).normalize()

export function gameplayBoundsForState(state: GameState, movingCars: MovingCarRenderItem[]): SceneFitBounds {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  const include = (x: number, z: number): void => {
    if (x < minX) {
      minX = x
    }
    if (x > maxX) {
      maxX = x
    }
    if (z < minZ) {
      minZ = z
    }
    if (z > maxZ) {
      maxZ = z
    }
  }

  // Frame the level's car cluster, not the whole board: sparse layouts read
  // "in scale" only when the cars fill the view. Every car participates with
  // its layout footprint (positions are never mutated by parking/departing),
  // so the frame stays stable for the entire level.
  let clusterMinX = Number.POSITIVE_INFINITY
  let clusterMaxX = Number.NEGATIVE_INFINITY
  let clusterMinZ = Number.POSITIVE_INFINITY
  let clusterMaxZ = Number.NEGATIVE_INFINITY
  const includeCell = (cellX: number, cellY: number): void => {
    const x = (cellX - BOARD_CENTER_X) * CELL_SIZE
    const z = FIELD_Z + (cellY - BOARD_CENTER_Y) * CELL_SIZE
    clusterMinX = Math.min(clusterMinX, x - CELL_SIZE / 2)
    clusterMaxX = Math.max(clusterMaxX, x + CELL_SIZE / 2)
    clusterMinZ = Math.min(clusterMinZ, z - CELL_SIZE / 2)
    clusterMaxZ = Math.max(clusterMaxZ, z + CELL_SIZE / 2)
  }

  for (const car of state.cars) {
    for (const cell of getCarCells(car)) {
      includeCell(cell.x, cell.y)
    }
  }

  for (const tunnel of state.tunnels) {
    includeCell(tunnel.garagePosition.x, tunnel.garagePosition.y)
  }

  if (!Number.isFinite(clusterMinX)) {
    includeCell(0, 0)
    includeCell(state.boardWidth - 1, state.boardHeight - 1)
  }

  const growX = Math.max(0, MIN_CLUSTER_SPAN - (clusterMaxX - clusterMinX)) / 2
  const growZ = Math.max(0, MIN_CLUSTER_SPAN - (clusterMaxZ - clusterMinZ)) / 2
  include(clusterMinX - growX, clusterMinZ - growZ)
  include(clusterMaxX + growX, clusterMaxZ + growZ)

  // Locked "+" slots render too, so the whole parking row participates.
  for (const slot of state.parkingSlots) {
    const position = parkingSlotPosition(slot.index, slot.kind)
    include(position.x, position.z)
  }
  // Ensure the full parking row depth is visible even if all slots are stacked at one z.
  include(0, PARKING_Z)

  const layout = queueLayoutForState(state)
  const queueHalfWidth = layout.halfWidth + layout.capRadius
  include(-queueHalfWidth, QUEUE_Z - layout.capRadius)
  include(queueHalfWidth, QUEUE_Z + layout.capRadius)

  for (const side of [-1, 1] as const) {
    const curve = feederCurve(side, layout)
    for (let i = 0; i <= FEEDER_CURVE_SAMPLES; i += 1) {
      const t = (i / FEEDER_CURVE_SAMPLES) * FEEDER_BOUNDS_T_MAX
      const point = curve.getPointAt(t)
      include(point.x, point.z)
    }
  }

  for (const moving of movingCars) {
    // Routes intentionally travel the board perimeter, well outside the framed
    // cluster. Including them would zoom the camera out for the whole drive, so
    // only the car's current visible position participates.
    include(moving.mesh.position.x, moving.mesh.position.z)
  }

  return {
    minX: minX - BOUNDS_PADDING,
    maxX: maxX + BOUNDS_PADDING,
    minZ: minZ - BOUNDS_PADDING,
    maxZ: maxZ + BOUNDS_PADDING,
  }
}

export function fitCameraToGameplayBounds({
  camera,
  width,
  height,
  bounds,
  topPaddingPx = 8,
  bottomPaddingPx = 72,
  sidePaddingPx = 8,
}: FitCameraOptions): void {
  camera.fov = CAMERA_FOV_DEGREES
  camera.aspect = width / height
  camera.near = CAMERA_NEAR
  camera.far = CAMERA_FAR

  const target = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  )

  const sidePadNdc = clampNdcPadding(sidePaddingPx, width)
  const topPadNdc = clampNdcPadding(topPaddingPx, height)
  const bottomPadNdc = clampNdcPadding(bottomPaddingPx, height)
  const ndcXMin = -1 + sidePadNdc
  const ndcXMax = 1 - sidePadNdc
  const ndcYMin = -1 + bottomPadNdc
  const ndcYMax = 1 - topPadNdc

  const corners: THREE.Vector3[] = [
    new THREE.Vector3(bounds.minX, 0, bounds.minZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.minZ),
    new THREE.Vector3(bounds.minX, 0, bounds.maxZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.maxZ),
  ]

  const projected = new THREE.Vector3()
  const offset = new THREE.Vector3()

  const apply = (distance: number): void => {
    offset.copy(LOOK_DIRECTION).multiplyScalar(-distance)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }

  const fits = (distance: number): boolean => {
    apply(distance)
    for (const corner of corners) {
      projected.copy(corner).project(camera)
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        projected.x < ndcXMin ||
        projected.x > ndcXMax ||
        projected.y < ndcYMin ||
        projected.y > ndcYMax
      ) {
        return false
      }
    }

    return true
  }

  if (!fits(FIT_MAX_DISTANCE)) {
    // Bounds are too large to fit even at maximum distance; settle on the
    // furthest distance to minimise clipping rather than locking up.
    apply(FIT_MAX_DISTANCE)

    return
  }

  let low = FIT_MIN_DISTANCE
  let high = FIT_MAX_DISTANCE
  if (fits(low)) {
    apply(low)

    return
  }

  for (let i = 0; i < FIT_ITERATIONS; i += 1) {
    const mid = (low + high) / 2
    if (fits(mid)) {
      high = mid
    } else {
      low = mid
    }
  }

  apply(high)
}

function clampNdcPadding(paddingPx: number, sizePx: number): number {
  if (sizePx <= 0) {
    return 0
  }
  const ndc = (paddingPx / sizePx) * 2

  return Math.max(0, Math.min(1.8, ndc))
}
