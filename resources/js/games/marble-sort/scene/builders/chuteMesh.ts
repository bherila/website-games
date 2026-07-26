import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { type Chute } from '../../gameEngine'
import { chutePosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

/** Dispenser silo standing on the island beside the grid: body, roof, and a
 * feed mouth bridging toward the grid edge, with the remaining-box count on
 * a badge above. */
export function createChuteMesh(chute: Chute): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(chutePosition(chute.row, chute.side))

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.64, 0.46, 0.68, 5, 0.14),
    new THREE.MeshPhysicalMaterial({
      color: '#3d7ff0',
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.3,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const roof = new THREE.Mesh(
    new RoundedBoxGeometry(0.72, 0.14, 0.76, 3, 0.07),
    new THREE.MeshPhysicalMaterial({
      color: '#2b62c8',
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.3,
    }),
  )
  roof.position.y = 0.28
  roof.castShadow = true
  group.add(roof)

  // Feed mouth bridging toward the grid so the chute reads as "attached".
  const mouth = new THREE.Mesh(
    new RoundedBoxGeometry(0.3, 0.26, 0.5, 3, 0.08),
    new THREE.MeshPhysicalMaterial({
      color: '#2b62c8',
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.3,
    }),
  )
  mouth.position.set(chute.side === 'left' ? 0.44 : -0.44, -0.08, 0)
  mouth.castShadow = true
  group.add(mouth)

  const label = createTextSprite(String(chute.remaining), {
    background: '#ffffff',
    color: '#111827',
    fontSize: 84,
  })
  label.position.set(0, 0.52, 0)
  label.scale.set(0.4, 0.22, 1)
  label.renderOrder = 4
  group.add(label)

  return group
}
