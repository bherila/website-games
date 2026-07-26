import * as THREE from 'three'

import type { CraftState } from '../gameTypes'
import { COCKPIT_HEIGHT } from '../gameTypes'

/**
 * Rear-view mirror layout, as fractions of the canvas. HudOverlay renders the
 * DOM mirror frame from these same constants so glass and frame stay aligned.
 */
export const MIRROR_LAYOUT = {
  widthFrac: 0.34,
  heightFrac: 0.115,
  topFrac: 0.015,
  maxWidthPx: 560,
} as const

export interface MirrorRect {
  x: number
  y: number
  width: number
  height: number
}

/** Mirror rect in CSS/canvas pixels measured from the top-left. */
export function mirrorRectPx(canvasWidth: number, canvasHeight: number): MirrorRect {
  const width = Math.min(canvasWidth * MIRROR_LAYOUT.widthFrac, MIRROR_LAYOUT.maxWidthPx)
  const height = canvasHeight * MIRROR_LAYOUT.heightFrac
  return {
    x: (canvasWidth - width) / 2,
    y: canvasHeight * MIRROR_LAYOUT.topFrac,
    width,
    height,
  }
}

export function createMirrorCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(52, 3, 0.1, 300)
}

/**
 * Places the mirror camera at the player's head looking backwards, with the
 * projection flipped horizontally so the image reads as a true mirror.
 * (Scene materials are DoubleSide, so the reversed winding is harmless.)
 */
export function updateMirrorCamera(camera: THREE.PerspectiveCamera, player: CraftState, aspect: number): void {
  camera.position.set(player.pos.x, player.altitude + COCKPIT_HEIGHT * 0.95, player.pos.z)
  camera.rotation.set(0, player.heading + Math.PI, 0)
  if (Math.abs(camera.aspect - aspect) > 1e-3) {
    camera.aspect = aspect
  }
  camera.updateProjectionMatrix()
  camera.projectionMatrix.elements[0] = -(camera.projectionMatrix.elements[0] ?? 0)
}

/**
 * Renders the rear view into the top-center scissor rect. Call after the main
 * render each frame; resets scissor state before returning.
 */
export function renderMirror(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const rect = mirrorRectPx(canvasWidth, canvasHeight)
  if (rect.width < 8 || rect.height < 8) {
    return
  }

  const bottomY = canvasHeight - rect.y - rect.height
  renderer.setScissorTest(true)
  renderer.setScissor(rect.x, bottomY, rect.width, rect.height)
  renderer.setViewport(rect.x, bottomY, rect.width, rect.height)
  renderer.render(scene, camera)
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, canvasWidth, canvasHeight)
}
