/**
 * Renderer lifecycle + disposal helpers, copied from
 * `resources/js/games/hover/scene/threeUtils.ts`. Geometries/textures marked
 * `userData.cached = true` are treated as shared/pooled and skipped so a
 * board rebuild never disposes a texture another material still references.
 */
import * as THREE from 'three'

export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0]
    if (child) {
      group.remove(child)
      disposeObject(child)
    }
  }
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry && mesh.geometry.userData.cached !== true) {
      mesh.geometry.dispose()
    }

    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) {
        disposeMaterial(item)
      }
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function disposeMaterial(material: THREE.Material): void {
  const maybeTextured = material as THREE.Material & { map?: THREE.Texture }
  if (maybeTextured.map && maybeTextured.map.userData.cached !== true) {
    maybeTextured.map.dispose()
  }

  material.dispose()
}

export function hexColor(value: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(value))).toString(16).padStart(6, '0')}`
}

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
