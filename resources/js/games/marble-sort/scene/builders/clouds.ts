import * as THREE from 'three'

export interface CloudDrifter {
  group: THREE.Group
  speed: number
}

export interface CloudField {
  group: THREE.Group
  drifters: CloudDrifter[]
}

const WRAP_X = 12

interface CloudSpec {
  x: number
  y: number
  z: number
  scale: number
  speed: number
}

// Clouds drift along X and wrap, so every lane crosses the full width of the
// scene. Low lanes (y < 0) therefore live BEHIND the launch island (z <= -5)
// or far south past the collector plinth (z >= 9.5) — never in the corridor
// where they would drift in front of the boxes, belt, or trays.
const CLOUD_SPECS: CloudSpec[] = [
  { x: -6.4, y: -0.9, z: -5.2, scale: 1.25, speed: 0.16 },
  { x: 5.6, y: -1.1, z: -6.4, scale: 1.0, speed: 0.12 },
  { x: 7.8, y: -0.7, z: -7.6, scale: 1.4, speed: 0.1 },
  { x: -8.2, y: -1.3, z: 9.8, scale: 0.9, speed: 0.2 },
  { x: 2.4, y: -1.15, z: 10.6, scale: 1.1, speed: 0.14 },
  { x: -3.8, y: 1.7, z: -8.6, scale: 1.7, speed: 0.07 },
  { x: 5.2, y: 2.3, z: -9.4, scale: 2.0, speed: 0.05 },
  { x: -9.6, y: 0.9, z: -7.4, scale: 1.3, speed: 0.09 },
]

const PUFF_OFFSETS: Array<[number, number, number, number]> = [
  [0, 0, 0, 0.52],
  [-0.55, -0.05, 0.12, 0.38],
  [0.55, -0.02, -0.1, 0.42],
  [0.12, 0.22, 0.05, 0.34],
  [-0.2, -0.12, -0.3, 0.3],
]

export function createCloudField(): CloudField {
  const group = new THREE.Group()
  const drifters: CloudDrifter[] = []
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    transparent: true,
    opacity: 0.96,
  })

  for (const spec of CLOUD_SPECS) {
    const cloud = new THREE.Group()
    for (const [dx, dy, dz, radius] of PUFF_OFFSETS) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material)
      puff.position.set(dx, dy, dz)
      puff.scale.y = 0.78
      cloud.add(puff)
    }
    cloud.position.set(spec.x, spec.y, spec.z)
    cloud.scale.setScalar(spec.scale)
    group.add(cloud)
    drifters.push({ group: cloud, speed: spec.speed })
  }

  return { group, drifters }
}

export function updateCloudField(field: CloudField, delta: number): void {
  for (const drifter of field.drifters) {
    drifter.group.position.x += drifter.speed * delta
    if (drifter.group.position.x > WRAP_X) {
      drifter.group.position.x = -WRAP_X
    }
  }
}
