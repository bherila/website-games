import * as THREE from 'three'

import type { Plate } from './level'

/** A panel's local Z follows its outward normal, including the pitched roof. */
export function plateQuaternion(plate: Plate): THREE.Quaternion {
  const normal = new THREE.Vector3().fromArray(plate.normal)
  const up = new THREE.Vector3().fromArray(plate.up)
  const right = new THREE.Vector3().crossVectors(up, normal).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
}

export function plateOutline(plate: Plate): THREE.Shape {
  const [width, height] = plate.size
  const x = -width / 2
  const y = -height / 2
  const shape = new THREE.Shape()
  if (plate.gableRise) {
    shape.moveTo(x, y)
    shape.lineTo(-x, y)
    shape.lineTo(-x, -y)
    shape.lineTo(0, -y + plate.gableRise)
    shape.lineTo(x, -y)
    shape.closePath()
  } else {
    const radius = 0.06
    shape.moveTo(x + radius, y)
    shape.lineTo(-x - radius, y)
    shape.quadraticCurveTo(-x, y, -x, y + radius)
    shape.lineTo(-x, -y - radius)
    shape.quadraticCurveTo(-x, -y, -x - radius, -y)
    shape.lineTo(x + radius, -y)
    shape.quadraticCurveTo(x, -y, x, -y - radius)
    shape.lineTo(x, y + radius)
    shape.quadraticCurveTo(x, y, x + radius, y)
  }
  return shape
}

function box(parent: THREE.Group, size: readonly [number, number, number], position: readonly [number, number, number], color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }))
  mesh.position.fromArray(position)
  parent.add(mesh)
  return mesh
}

function windowFrame(parent: THREE.Group, x: number, y: number, width = 0.66, height = 0.72): void {
  box(parent, [width + 0.15, height + 0.15, 0.07], [x, y, 0.16], '#fff7e4')
  box(parent, [width, height, 0.075], [x, y, 0.205], '#80b7bf')
  box(parent, [width, 0.045, 0.035], [x, y, 0.26], '#fff7e4')
  box(parent, [0.045, height, 0.035], [x, y, 0.26], '#fff7e4')
  box(parent, [width + 0.24, 0.07, 0.19], [x, y - height / 2 - 0.07, 0.22], '#d1ae80')
}

/** All architectural details belong to their panel, so they leave with it. */
export function decoratePlate(plate: Plate): THREE.Group {
  const details = new THREE.Group()
  const [width, height] = plate.size
  const cream = '#fff2d7'
  if (plate.finish === 'roof') {
    // Raised tile courses and staggered etched joints read at phone size.
    const vertices: number[] = []
    for (let row = 0; row < 6; row++) {
      const y = -height / 2 + 0.12 + row * (height - 0.24) / 5
      box(details, [width - 0.08, 0.035, 0.035], [0, y, 0.145], '#ca7c62')
      if (row === 5) continue
      for (let column = 0; column < 5; column++) {
        const x = -width / 2 + 0.2 + column * 0.65 + (row % 2) * 0.28
        if (x < width / 2 - 0.12) vertices.push(x, y + 0.03, 0.135, x, y + 0.42, 0.135)
      }
    }
    const joints = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color: '#7f4038' }))
    // Painted joints do not obstruct a screw's selection ray.
    joints.raycast = () => {}
    details.add(joints)
    for (const side of [-1, 1]) box(details, [0.09, height + 0.04, 0.13], [side * (width / 2 - 0.025), 0, 0.075], cream)
    box(details, [width + 0.04, 0.09, 0.13], [0, -height / 2 + 0.025, 0.08], cream)
    return details
  }

  for (const side of [-1, 1]) box(details, [0.10, height, 0.08], [side * (width / 2 - 0.04), 0, 0.13], cream)
  box(details, [width, 0.12, 0.09], [0, -height / 2 + 0.03, 0.14], '#cfb18c')
  box(details, [width, 0.10, 0.10], [0, height / 2 - 0.03, 0.14], cream)
  if (plate.finish === 'side') {
    for (const y of [-0.9, -0.45, 0, 0.45, 0.9]) box(details, [width - 0.18, 0.012, 0.01], [0, y, 0.135], '#d8c29e')
    windowFrame(details, 0.35, -0.05, 0.75, 0.84)
  } else {
    windowFrame(details, -1.0, -0.05)
    windowFrame(details, 1.0, -0.05)
    if (plate.finish === 'front') {
      box(details, [0.88, 1.45, 0.08], [0, -0.55, 0.16], cream)
      box(details, [0.72, 1.36, 0.09], [0, -0.59, 0.21], '#477f78')
      for (const y of [-0.95, -0.5]) box(details, [0.49, 0.32, 0.025], [0, y, 0.27], '#578e84')
      box(details, [0.43, 0.28, 0.025], [0, -0.12, 0.27], '#a9ced0')
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: '#d7aa57', metalness: 0.6, roughness: 0.3 }))
      handle.position.set(0.24, -0.56, 0.30)
      details.add(handle)
    }
    const attic = new THREE.Mesh(new THREE.CircleGeometry(0.20, 24), new THREE.MeshStandardMaterial({ color: '#7aaeb7' }))
    attic.position.set(0, 1.75, 0.145)
    details.add(attic)
    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.045, 6, 24), new THREE.MeshStandardMaterial({ color: cream, roughness: 0.7 }))
    surround.position.set(0, 1.75, 0.16)
    details.add(surround)
    box(details, [0.37, 0.04, 0.035], [0, 1.75, 0.17], cream)
    box(details, [0.04, 0.37, 0.035], [0, 1.75, 0.17], cream)
  }
  return details
}

/** A permanent garden plinth grounds the removable house panels. */
export function createGarden(): THREE.Group {
  const garden = new THREE.Group()
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.84, 0.24, 64), new THREE.MeshStandardMaterial({ color: '#b7ca97', roughness: 1 }))
  grass.position.y = -1.88
  grass.receiveShadow = true
  garden.add(grass)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.84, 2.72, 0.17, 64), new THREE.MeshStandardMaterial({ color: '#d1b48c', roughness: 0.9 }))
  soil.position.y = -2.06
  garden.add(soil)
  const foundation = box(garden, [3.94, 0.20, 2.88], [0, -1.65, 0], '#dfc299')
  foundation.receiveShadow = true
  for (const x of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) box(garden, [0.014, 0.008, 2.85], [x, -1.546, 0], '#b89871')
  box(garden, [0.94, 0.13, 0.42], [0, -1.69, 1.57], '#dfcdb0')
  box(garden, [0.72, 0.07, 0.37], [0, -1.73, 2.04], '#e4d4b7')
  for (const [x, z, radius] of [[-2.18, 1.15, 0.28], [2.18, 0.95, 0.26], [-2.05, -1.3, 0.32], [2.05, -1.3, 0.3]]) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), new THREE.MeshStandardMaterial({ color: '#719777', roughness: 0.9, flatShading: true }))
    bush.position.set(x!, -1.65, z!)
    garden.add(bush)
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#be8064', roughness: 0.9 }))
  pot.position.set(-1.52, -1.65, 1.73)
  garden.add(pot)
  for (const [x, y] of [[-0.08, 0.12], [0.06, 0.16], [0, 0.05]]) {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshStandardMaterial({ color: '#f5d596', roughness: 0.8 }))
    flower.position.set(-1.52 + x!, -1.45 + y!, 1.73)
    garden.add(flower)
  }
  return garden
}
