import * as THREE from 'three'

import { MARBLE_KINDS, type MarbleKind } from '../../physics/marbles'
import { markGlass } from '../glassQuality'
import { MARBLE_STYLES } from '../palette'

export interface MarbleMesh {
  kind: MarbleKind
  group: THREE.Group
  /** Rotates with the physics body so rolling reads clearly. */
  spinner: THREE.Group
}

/**
 * Real refractive glass: `transmission` makes three.js render the scene behind the marble
 * into a buffer and bend it through the sphere, so tracks and the pegboard show through,
 * magnified and flipped, like a real marble. The scene's environment map supplies the
 * reflections on top.
 */
function glassMaterial(tint: string, attenuation: string): THREE.MeshPhysicalMaterial {
  return markGlass(new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.35,
    ior: 1.5,
    attenuationColor: new THREE.Color(attenuation),
    attenuationDistance: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
    envMapIntensity: 1.4,
  }), 0.55)
}

/** A cat's-eye vane set: thin coloured blades sealed inside the glass. */
function addSwirl(spinner: THREE.Group, radius: number, colors: readonly string[]): void {
  colors.forEach((color, index) => {
    const vane = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.78, 20, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.2 }),
    )
    vane.scale.set(1, 0.22, 0.5)
    vane.rotation.z = index * (Math.PI / colors.length)
    spinner.add(vane)
  })
}

export function createMarbleMesh(kind: MarbleKind): MarbleMesh {
  const { radius } = MARBLE_KINDS[kind]
  const style = MARBLE_STYLES[kind]
  const group = new THREE.Group()
  group.name = `marble:${kind}`
  const spinner = new THREE.Group()

  if (kind === 'steel') {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 40, 28),
      new THREE.MeshPhysicalMaterial({ color: style.tint, metalness: 1, roughness: 0.14, clearcoat: 0.4, envMapIntensity: 1.6 }),
    )
    ball.castShadow = true
    spinner.add(ball)
    // A faint machined band so the roll is visible on a mirror ball.
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.99, radius * 0.03, 8, 40),
      new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 1, roughness: 0.4 }),
    )
    spinner.add(band)
    group.add(spinner)

    return { kind, group, spinner }
  }

  const glass = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), glassMaterial(style.tint, style.attenuation))
  glass.castShadow = true
  group.add(glass)
  addSwirl(spinner, radius, style.swirl)
  group.add(spinner)

  return { kind, group, spinner }
}
