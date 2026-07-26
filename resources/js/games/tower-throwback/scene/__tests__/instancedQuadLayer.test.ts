import * as THREE from 'three'

import { createInstancedQuadLayer, disposeInstancedQuadLayer, syncInstancedQuadLayer } from '../instancedQuadLayer'

describe('instancedQuadLayer', () => {
  it('shares enabled-state sync and disposal for instanced overlays', () => {
    const scene = new THREE.Scene()
    const layer = createInstancedQuadLayer(scene, new THREE.MeshBasicMaterial(), 4, 2.5)

    layer.enabled = true
    syncInstancedQuadLayer(layer, () => 2)

    expect(layer.mesh.count).toBe(2)
    expect(layer.mesh.visible).toBe(true)
    expect(layer.mesh.position.z).toBe(2.5)

    layer.enabled = false
    syncInstancedQuadLayer(layer, () => {
      throw new Error('disabled layers must not populate instances')
    })

    expect(layer.mesh.count).toBe(0)
    expect(layer.mesh.visible).toBe(false)

    disposeInstancedQuadLayer(layer)

    expect(scene.children).not.toContain(layer.mesh)
  })
})
