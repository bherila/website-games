import * as THREE from 'three'

/**
 * The rival drone, in the spirit of the original: a pale saucer body wrapped
 * by two glowing blue rings, dark canopy dome, and a hover skirt.
 */
export function createDroneMesh(): THREE.Group {
  const group = new THREE.Group()

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.35, metalness: 0.45, side: THREE.DoubleSide })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), bodyMaterial)
  body.scale.set(1, 0.55, 1)
  body.position.y = 0.85
  group.add(body)

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0f2144, roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide }),
  )
  canopy.position.y = 1.1
  group.add(canopy)

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    emissive: 0x1d4ed8,
    emissiveIntensity: 1.4,
    roughness: 0.3,
    metalness: 0.4,
    side: THREE.DoubleSide,
  })
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.09, 12, 40), ringMaterial)
  ringA.name = 'ringA'
  ringA.rotation.x = Math.PI / 2
  ringA.position.y = 0.85
  group.add(ringA)

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 12, 40), ringMaterial.clone())
  ringB.name = 'ringB'
  ringB.rotation.x = Math.PI / 2.6
  ringB.position.y = 0.85
  group.add(ringB)

  const skirt = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 0.5, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x93a6c4, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
  )
  skirt.position.y = 0.4
  group.add(skirt)

  const glow = new THREE.PointLight(0x3b82f6, 6, 8)
  glow.position.y = 0.9
  group.add(glow)

  return group
}

/** Spin the rings a touch each frame so the drone reads as alive. */
export function animateDroneRings(drone: THREE.Object3D, timeSec: number): void {
  const ringA = drone.getObjectByName('ringA')
  const ringB = drone.getObjectByName('ringB')
  if (ringA) {
    ringA.rotation.z = timeSec * 1.6
  }
  if (ringB) {
    ringB.rotation.z = -timeSec * 1.1
  }
}

/**
 * Cockpit dashboard parented to the first-person camera: a slim curved sill
 * across the bottom of the view with two grip handles — enough to sell
 * "you're inside a hovercraft" without blocking sight lines.
 */
export function createCockpitDash(accentColor: number): THREE.Group {
  const group = new THREE.Group()

  const cowlMaterial = new THREE.MeshStandardMaterial({ color: 0x161e2e, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide })
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.55), cowlMaterial)
  cowl.position.set(0, -1.12, -1.45)
  cowl.rotation.x = 0.5
  group.add(cowl)

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.035, 0.05),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.8,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  )
  trim.position.set(0, -0.93, -1.42)
  trim.rotation.x = 0.5
  group.add(trim)

  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x38445c, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide })
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 10), handleMaterial)
    handle.position.set(side * 0.88, -0.92, -1.28)
    handle.rotation.z = side * 0.5
    handle.rotation.x = -0.7
    group.add(handle)
  }

  return group
}
