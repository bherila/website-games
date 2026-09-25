import * as THREE from 'three'

import { MARBLE_RADIUS } from '../../physics/constants'
import { MARBLE_SWIRL_COLORS, MARBLE_TINT } from '../palette'

export interface MarbleMesh {
  group: THREE.Group
  /** Rotates with the physics body so rolling reads clearly. */
  spinner: THREE.Group
}

/** Glass marble with a cat's-eye swirl inside and a fixed specular glint. */
export function createMarbleMesh(): MarbleMesh {
  const group = new THREE.Group()
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS, 32, 24),
    new THREE.MeshPhysicalMaterial({
      color: MARBLE_TINT,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.55,
    }),
  )
  glass.castShadow = true
  group.add(glass)

  const spinner = new THREE.Group()
  MARBLE_SWIRL_COLORS.forEach((color, index) => {
    const vane = new THREE.Mesh(
      new THREE.SphereGeometry(MARBLE_RADIUS * 0.82, 20, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.15 }),
    )
    vane.scale.set(1, 0.28, 0.5)
    vane.rotation.z = index * (Math.PI / 2)
    spinner.add(vane)
  })
  group.add(spinner)

  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS * 0.22, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
  )
  glint.position.set(-MARBLE_RADIUS * 0.4, MARBLE_RADIUS * 0.45, MARBLE_RADIUS * 0.7)
  group.add(glint)

  return { group, spinner }
}
