import * as THREE from 'three'

import { CANNON_BARREL_LENGTH, CANNON_PIVOT_HEIGHT } from '../sceneConstants'
import { createCanvasTexture } from '../threeUtils'

export interface CannonMesh {
  /** Static base/wheels — add directly to the scene at CANNON_MUZZLE_POSITION's X/Z, y=0. */
  group: THREE.Group
  /** Rotates around Y for horizontal aim. */
  yawPivot: THREE.Object3D
  /** Rotates around local X for elevation; child of yawPivot. */
  pitchPivot: THREE.Object3D
  /** The barrel mesh itself, for recoil (local Z offset). */
  barrel: THREE.Mesh
}

const CANNON_RED = 0xd93636
const CANNON_YELLOW = 0xf7c948
const BARREL_LENGTH = CANNON_BARREL_LENGTH
const BARREL_RADIUS = 0.34

function starTexture(): THREE.CanvasTexture {
  return createCanvasTexture((context, size) => {
    context.fillStyle = '#d93636'
    context.fillRect(0, 0, size, size)
    context.fillStyle = '#f7c948'
    const starCount = 5
    for (let i = 0; i < starCount; i += 1) {
      const cx = ((i + 0.5) / starCount) * size
      const cy = size / 2
      drawStar(context, cx, cy, size * 0.09)
    }
  })
}

function drawStar(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  context.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
    const x = cx + (Math.cos(angle) * r)
    const y = cy + (Math.sin(angle) * r)
    if (i === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
  context.fill()
}

/** Builds a stylized circus cannon: red/yellow-star body + silver barrel on a small round base. */
export function createCannonMesh(): CannonMesh {
  const group = new THREE.Group()

  const baseGeometry = new THREE.CylinderGeometry(1.1, 1.2, 0.3, 20)
  const base = new THREE.Mesh(baseGeometry, new THREE.MeshLambertMaterial({ color: 0x8a5a2b }))
  base.position.y = 0.15
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const yawPivot = new THREE.Group()
  yawPivot.position.set(0, CANNON_PIVOT_HEIGHT, 0)
  group.add(yawPivot)

  const bodyGeometry = new THREE.SphereGeometry(0.6, 16, 12)
  const bodyTexture = starTexture()
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshLambertMaterial({ map: bodyTexture, color: CANNON_RED }))
  body.castShadow = true
  yawPivot.add(body)

  const pitchPivot = new THREE.Group()
  yawPivot.add(pitchPivot)

  // Local "forward" is -Z (the muzzle sits at world z ~ +7, aiming back toward the platforms near
  // z=0), matching cannonAimAngles' basis in scene/aiming.ts.
  const barrelGeometry = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS * 1.15, BARREL_LENGTH, 16)
  barrelGeometry.rotateX(-Math.PI / 2)
  barrelGeometry.translate(0, 0, -BARREL_LENGTH / 2)
  const barrel = new THREE.Mesh(barrelGeometry, new THREE.MeshLambertMaterial({ color: 0xc7ccd4 }))
  barrel.castShadow = true
  pitchPivot.add(barrel)

  const muzzleRing = new THREE.Mesh(
    new THREE.TorusGeometry(BARREL_RADIUS * 1.05, 0.05, 6, 16),
    new THREE.MeshLambertMaterial({ color: CANNON_YELLOW }),
  )
  muzzleRing.position.z = -BARREL_LENGTH
  barrel.add(muzzleRing)

  return { group, yawPivot, pitchPivot, barrel }
}

/** Aims the cannon's pivots toward a yaw/pitch (radians, see scene/aiming.ts#cannonAimAngles). */
export function setCannonAim(cannon: CannonMesh, yaw: number, pitch: number): void {
  cannon.yawPivot.rotation.y = yaw
  cannon.pitchPivot.rotation.x = pitch
}
