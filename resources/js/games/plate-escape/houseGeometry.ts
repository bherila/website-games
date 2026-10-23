import * as THREE from 'three'

import type { Plate, Screw } from './level'

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
  if (plate.finish === 'sign') {
    for (const y of [-0.34, 0.34]) box(details, [width - 0.04, 0.06, 0.05], [0, y, 0.14], cream)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = cream
      context.font = 'bold 78px sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('C A F É', 256, 68)
      const label = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.52), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }))
      label.position.z = 0.15
      label.raycast = () => {}
      details.add(label)
    }
    return details
  }
  if (plate.finish === 'sail') {
    for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) box(details, [0.07, height, 0.045], [x, 0, 0.14], '#986e45')
    for (const y of [-0.8, -0.4, 0, 0.4, 0.8]) box(details, [width - 0.04, 0.045, 0.045], [0, y, 0.14], '#c19b6c')
    return details
  }
  if (plate.translucent) {
    const frame = '#e3e6c6'
    for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) box(details, [0.08, height, 0.10], [x, 0, 0.14], frame)
    for (const y of [-height / 2 + 0.04, height / 2 - 0.04]) box(details, [width, 0.08, 0.10], [0, y, 0.14], frame)
    if (plate.gableRise) {
      const span = Math.hypot(width / 2, plate.gableRise)
      for (const side of [-1, 1]) {
        const trim = box(details, [span, 0.07, 0.10], [side * width / 4, height / 2 + plate.gableRise / 2, 0.14], frame)
        trim.rotation.z = -side * Math.atan2(plate.gableRise, width / 2)
      }
    }
    if (plate.finish === 'awning') {
      for (const x of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) box(details, [0.20, height - 0.08, 0.025], [x, 0, 0.14], '#c46e5b')
    } else if (plate.finish !== 'glass') {
      box(details, [0.045, height - 0.08, 0.045], [0, 0, 0.14], frame)
      box(details, [width - 0.08, 0.045, 0.045], [0, -0.25, 0.14], frame)
    }
    return details
  }
  if (plate.finish === 'brace') {
    for (const y of [-0.3, 0, 0.3]) box(details, [width - 0.1, 0.025, 0.03], [0, y, 0.13], '#94653e')
    const diagonal = box(details, [width - 0.24, 0.10, 0.07], [0, 0, 0.16], '#d0a876')
    diagonal.rotation.z = 0.15
    return details
  }
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
export function createGarden(theme?: 'windmill' | 'glasshouse' | 'cafe'): THREE.Group {
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
  if (theme === 'glasshouse') {
    for (const x of [-1.2, 1.2]) for (const z of [-0.75, 0, 0.75]) {
      box(garden, [0.38, 0.25, 0.38], [x, -1.35, z], '#b47d60')
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: '#679b70', flatShading: true }))
      foliage.position.set(x, -1.02, z)
      garden.add(foliage)
    }
  }
  return garden
}


/** The same panel body is used for rendering and geometry/access verification. */
export function createPlateMesh(plate: Plate, screws: readonly Screw[]): THREE.Mesh {
  const shape = plateOutline(plate)
  for (const screw of screws) {
    const hole = new THREE.Path()
    hole.absarc(screw.position[0], screw.position[1], 0.14, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2, steps: 1 })
  geometry.translate(0, 0, -0.09)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: plate.color, metalness: plate.translucent ? 0 : 0.12, roughness: plate.translucent ? 0.12 : 0.45, transparent: Boolean(plate.translucent), opacity: plate.translucent ? 0.22 : 1, depthWrite: !plate.translucent, side: plate.translucent ? THREE.DoubleSide : THREE.FrontSide }))
  mesh.castShadow = !plate.translucent
  mesh.receiveShadow = true
  if (plate.translucent) mesh.userData.glassPlateName = plate.name
  return mesh
}
