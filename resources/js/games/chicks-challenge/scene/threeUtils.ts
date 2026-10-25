/**
 * Renderer lifecycle + disposal helpers, copied from
 * `resources/js/games/hover/scene/threeUtils.ts`. Geometries/textures marked
 * `userData.cached = true` are treated as shared/pooled and skipped so a
 * board rebuild never disposes a texture another material still references.
 */
import * as THREE from 'three'

// Disposal and color helpers live in the shared module; re-exported for this game's scene code.
export { clearGroup, disposeObject, hexColor } from '../../_shared/three/threeUtils'

/** Builds a square canvas texture from a draw callback. Never call from module scope — canvas needs a DOM. */
export function createCanvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create a 2D canvas context for a Chicks tile texture.')
  }

  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}

export function disposeRenderer(renderer: THREE.WebGLRenderer, container: HTMLElement): void {
  renderer.dispose()
  if (renderer.domElement.parentElement === container) {
    container.removeChild(renderer.domElement)
  }
}
