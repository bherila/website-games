import * as THREE from 'three'

import { disposeObject } from './threeUtils'

const QUAD = new THREE.PlaneGeometry(1, 1)
QUAD.userData.cached = true

export interface InstancedQuadLayer {
  mesh: THREE.InstancedMesh
  enabled: boolean
}

export function createInstancedQuadLayer(
  scene: THREE.Scene,
  material: THREE.Material,
  capacity: number,
  z: number,
): InstancedQuadLayer {
  const mesh = new THREE.InstancedMesh(QUAD, material, capacity)
  mesh.count = 0
  mesh.visible = false
  mesh.position.z = z
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh, enabled: false }
}

export function syncInstancedQuadLayer(layer: InstancedQuadLayer, populate: (mesh: THREE.InstancedMesh) => number): void {
  const mesh = layer.mesh
  if (!layer.enabled) {
    if (mesh.count !== 0) {
      mesh.count = 0
      mesh.visible = false
      mesh.instanceMatrix.needsUpdate = true
    }
    return
  }

  const count = populate(mesh)
  mesh.count = count
  mesh.visible = count > 0
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true
  }
}

export function disposeInstancedQuadLayer(layer: InstancedQuadLayer): void {
  layer.mesh.parent?.remove(layer.mesh)
  disposeObject(layer.mesh)
}
