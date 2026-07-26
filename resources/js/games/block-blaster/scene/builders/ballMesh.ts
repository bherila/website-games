import * as THREE from 'three'

import { BALL_RADIUS } from '../sceneConstants'

/** A pooled cannonball mesh: dark stylized metal sphere with a soft rim highlight. */
export function createBallMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 20, 16)
  const material = new THREE.MeshStandardMaterial({
    color: 0x24262b,
    metalness: 0.6,
    roughness: 0.35,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true

  return mesh
}
