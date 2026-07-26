import * as THREE from 'three'

type TextureMaterialKey =
  | 'alphaMap'
  | 'aoMap'
  | 'bumpMap'
  | 'displacementMap'
  | 'emissiveMap'
  | 'envMap'
  | 'lightMap'
  | 'map'
  | 'metalnessMap'
  | 'normalMap'
  | 'roughnessMap'
  | 'specularMap'

const MATERIAL_TEXTURE_KEYS: TextureMaterialKey[] = [
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'map',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
]

/** Removes and disposes every child of a group (geometries, materials, textures). */
export function clearGroup(group: THREE.Group): void {
  const children = [...group.children]
  for (const child of children) {
    group.remove(child)
    disposeObject(child)
  }
}

/** Disposes an object's own + descendant geometries/materials/textures. Does not detach it from its parent. */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
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
  const textured = material as THREE.Material & Partial<Record<TextureMaterialKey, THREE.Texture | null>>
  for (const key of MATERIAL_TEXTURE_KEYS) {
    textured[key]?.dispose()
  }

  material.dispose()
}

/**
 * Builds a square canvas texture from a draw callback. Used for the cheap procedural
 * stripe/accent looks on block faces and cannon/tent decoration (never real asset files).
 */
export function createCanvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size = 128,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context.')
  }

  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}

export function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}
