import * as THREE from 'three'

import type { PlatformDef } from '../../levels/levelTypes'
import { PLATFORM_SLAB_THICKNESS } from '../sceneConstants'

export interface PlatformMesh {
  /** Everything for this platform (slab + pedestal); add directly to the scene/dynamic group. */
  group: THREE.Group
  /** The rotating top slab — copy the kinematic body's quaternion onto this each frame. */
  slab: THREE.Object3D
}

const PLATFORM_TOP_COLOR = 0xd9a066
const PLATFORM_RIM_COLOR = 0xb5793f
const PEDESTAL_COLOR = 0xc9c2b3

/** Builds a platform's visual slab (rotatable) + static pedestal column, per docs/games/block-blaster.md. */
export function createPlatformMesh(def: PlatformDef): PlatformMesh {
  const group = new THREE.Group()

  const slabGeometry = def.shape === 'round'
    ? new THREE.CylinderGeometry(def.radius, def.radius, PLATFORM_SLAB_THICKNESS, 32)
    : new THREE.BoxGeometry(def.radius * 2, PLATFORM_SLAB_THICKNESS, def.radius * 2)
  const slabMaterial = new THREE.MeshLambertMaterial({ color: PLATFORM_TOP_COLOR })
  const slab = new THREE.Mesh(slabGeometry, slabMaterial)
  slab.position.set(def.center[0], def.topY - (PLATFORM_SLAB_THICKNESS / 2), def.center[1])
  slab.castShadow = false
  slab.receiveShadow = true
  group.add(slab)

  if (def.shape === 'round') {
    const rimGeometry = new THREE.TorusGeometry(def.radius, PLATFORM_SLAB_THICKNESS * 0.18, 8, 32)
    const rim = new THREE.Mesh(rimGeometry, new THREE.MeshLambertMaterial({ color: PLATFORM_RIM_COLOR }))
    rim.rotation.x = Math.PI / 2
    // Local to the slab (rotates with it), sitting flush with its top face.
    rim.position.set(0, PLATFORM_SLAB_THICKNESS / 2, 0)
    slab.add(rim)
  }

  const pedestalHeight = Math.max(0.1, def.topY - (PLATFORM_SLAB_THICKNESS / 2))
  const pedestalRadius = def.radius * 0.4
  const pedestalGeometry = new THREE.CylinderGeometry(pedestalRadius, pedestalRadius * 1.15, pedestalHeight, 16)
  const pedestal = new THREE.Mesh(pedestalGeometry, new THREE.MeshLambertMaterial({ color: PEDESTAL_COLOR }))
  pedestal.position.set(def.center[0], pedestalHeight / 2, def.center[1])
  pedestal.castShadow = true
  pedestal.receiveShadow = true
  group.add(pedestal)

  return { group, slab }
}
