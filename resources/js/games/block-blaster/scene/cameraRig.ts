import * as THREE from 'three'

import {
  CAMERA_DOLLY_DURATION_S,
  CAMERA_DOLLY_START_OFFSET,
  CAMERA_FAR,
  CAMERA_FOV_DEGREES,
  CAMERA_NEAR,
  CAMERA_POSITION,
  CAMERA_TARGET,
} from './sceneConstants'

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - ((1 - clamped) ** 3)
}

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, aspect, CAMERA_NEAR, CAMERA_FAR)
  camera.position.set(...CAMERA_POSITION)
  camera.lookAt(...CAMERA_TARGET)

  return camera
}

export function updateCameraAspect(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = width / Math.max(1, height)
  camera.updateProjectionMatrix()
}

/**
 * Position of the gentle ease-in dolly at `elapsed` seconds into a level. Starts further back/up
 * (CAMERA_POSITION + CAMERA_DOLLY_START_OFFSET) and settles exactly on CAMERA_POSITION once
 * `duration` has elapsed.
 */
export function cameraDollyPosition(
  elapsed: number,
  duration: number = CAMERA_DOLLY_DURATION_S,
): THREE.Vector3 {
  const progress = duration <= 0 ? 1 : easeOutCubic(elapsed / duration)
  const [px, py, pz] = CAMERA_POSITION
  const [ox, oy, oz] = CAMERA_DOLLY_START_OFFSET

  return new THREE.Vector3(
    (px + ox) + ((px - (px + ox)) * progress),
    (py + oy) + ((py - (py + oy)) * progress),
    (pz + oz) + ((pz - (pz + oz)) * progress),
  )
}

/**
 * Projects a world position to CSS pixel coordinates within a `width` x `height` canvas. Returns
 * null when the point is behind the camera (so callers can hide the hint instead of drawing it
 * off in the wrong direction).
 */
const PROJECT_SCRATCH = new THREE.Vector3()

export function projectToScreen(
  camera: THREE.Camera,
  worldPosition: THREE.Vector3,
  width: number,
  height: number,
): { x: number, y: number } | null {
  const projected = PROJECT_SCRATCH.copy(worldPosition).project(camera)
  if (projected.z > 1) {
    return null
  }

  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
  }
}
