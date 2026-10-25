import * as THREE from 'three'

type TextureMaterialKey =
  | 'alphaMap'
  | 'aoMap'
  | 'bumpMap'
  | 'clearcoatMap'
  | 'clearcoatNormalMap'
  | 'clearcoatRoughnessMap'
  | 'displacementMap'
  | 'emissiveMap'
  | 'envMap'
  | 'gradientMap'
  | 'iridescenceMap'
  | 'iridescenceThicknessMap'
  | 'lightMap'
  | 'map'
  | 'matcap'
  | 'metalnessMap'
  | 'normalMap'
  | 'roughnessMap'
  | 'sheenColorMap'
  | 'sheenRoughnessMap'
  | 'specularColorMap'
  | 'specularIntensityMap'
  | 'specularMap'
  | 'thicknessMap'
  | 'transmissionMap'

const MATERIAL_TEXTURE_KEYS: TextureMaterialKey[] = [
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'lightMap',
  'map',
  'matcap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'specularMap',
  'thicknessMap',
  'transmissionMap',
]

/** Removes and disposes every child of a group (geometries, materials, textures). */
export function clearGroup(group: THREE.Group): void {
  const children = [...group.children]
  for (const child of children) {
    group.remove(child)
    disposeObject(child)
  }
}

/**
 * Disposes an object's own + descendant geometries, materials, textures, lights
 * and instance buffers. Does not detach it from its parent. Geometries and
 * textures marked `userData.cached` are shared across objects and survive.
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if ((child as THREE.Light).isLight) {
      ;(child as THREE.Light).dispose()
      return
    }

    const instanced = child as THREE.InstancedMesh
    if (instanced.isInstancedMesh) {
      instanced.dispose()
    }

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
  const textured = material as THREE.Material & Partial<Record<TextureMaterialKey, THREE.Texture | null>>
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = textured[key]
    if (texture && texture.userData.cached !== true) {
      texture.dispose()
    }
  }

  material.dispose()
}

/** A 0xRRGGBB number as a CSS hex color, clamped to the valid range. */
export function hexColor(value: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(value))).toString(16).padStart(6, '0')}`
}
