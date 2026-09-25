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
