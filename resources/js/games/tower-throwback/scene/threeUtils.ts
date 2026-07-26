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
    if ((child as THREE.Light).isLight) {
      ;(child as THREE.Light).dispose()
      return
    }

    const instanced = child as THREE.InstancedMesh
    if (instanced.isInstancedMesh) {
      instanced.dispose() // frees instanceMatrix/instanceColor GPU buffers
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
  const maybeTextured = material as THREE.Material & { map?: THREE.Texture }
  if (maybeTextured.map && maybeTextured.map.userData.cached !== true) {
    maybeTextured.map.dispose()
  }
  material.dispose()
}

export function hexColor(value: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(value))).toString(16).padStart(6, '0')}`
}
