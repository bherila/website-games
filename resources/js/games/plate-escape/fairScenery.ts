import * as THREE from 'three'

import { LEVELS, type Plate, type Screw } from './level'
import { RACK_MARK } from './screwMarks'

/**
 * Painted and fitted details for the fair's parts, and the fair's permanent scenery. Every detail
 * belongs to its panel and leaves with it, and none takes part in selection: a head is reached or
 * covered by the panels themselves.
 */

const CREAM = '#fbf3e4'
const GOLD = '#d9a441'
const BRASS = '#c9a64b'

function inert<T extends THREE.Object3D>(object: T): T {
  object.raycast = () => {}
  return object
}

function material(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra })
}

function block(parent: THREE.Object3D, size: readonly [number, number, number], position: readonly [number, number, number], color: string, extra?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
  const mesh = inert(new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, extra)))
  mesh.position.fromArray(position)
  parent.add(mesh)
  return mesh
}

function flat(parent: THREE.Object3D, points: readonly (readonly [number, number])[], z: number, color: string, extra?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
  const mesh = inert(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))), material(color, extra)))
  mesh.position.z = z
  parent.add(mesh)
  return mesh
}

function bulb(parent: THREE.Object3D, x: number, y: number, z: number, color = '#ffe6a0'): void {
  const mesh = inert(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), material(color, { emissive: color, emissiveIntensity: 0.9 })))
  mesh.position.set(x, y, z)
  parent.add(mesh)
}

const clear = (screws: readonly Screw[], x: number, y: number, distance: number): boolean => screws.every((screw) => Math.hypot(screw.position[0] - x, screw.position[1] - y) > distance)

/** The rack's peg rail in relief, `scale` panel units per head radius, centred at (x, y). */
export function rackMark(parent: THREE.Object3D, x: number, y: number, z: number, scale: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape(RACK_MARK.map(([px, py]) => new THREE.Vector2(x + px * scale, y + py * scale)))
  const mesh = inert(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), material(color, { roughness: 0.5 })))
  mesh.position.z = z
  mesh.name = 'rack-mark'
  parent.add(mesh)
  return mesh
}

/** Where a point lies in a plate's own X/Y. */
function local(plate: Plate, point: readonly number[]): [number, number] {
  const normal = new THREE.Vector3().fromArray(plate.normal)
  const up = new THREE.Vector3().fromArray(plate.up)
  const right = new THREE.Vector3().crossVectors(up, normal)
  const offset = new THREE.Vector3().fromArray(point).sub(new THREE.Vector3().fromArray(plate.position))
  return [offset.dot(right), offset.dot(up)]
}

/** A gilt bracket from the panel's edge to the hub of each collar it carries beyond that edge. */
function collarBrackets(details: THREE.Group, plate: Plate, levelId: number | undefined): void {
  const level = LEVELS.find((candidate) => candidate.id === levelId)
  for (const dial of level?.plates.filter((candidate) => candidate.dial && candidate.host === plate.id) ?? []) {
    const [x, y] = local(plate, dial.position)
    const edge = -plate.size[1] / 2
    if (y >= edge) continue
    block(details, [0.14, edge - y + 0.2, 0.08], [x, (edge + y) / 2 + 0.1, 0.2], GOLD, { metalness: 0.5, roughness: 0.35 })
  }
}

/** Decorates a fair part; false when the finish is not one of the fair's. */
export function decorateFairPlate(details: THREE.Group, plate: Plate, screws: readonly Screw[], levelId?: number): boolean {
  const [width, height] = plate.size
  switch (plate.finish) {
    case 'proscenium': {
      // Gilt mouldings round a red panel, and the bracket for any collar it carries.
      for (const y of [-height / 2 + 0.05, height / 2 - 0.05]) block(details, [width, 0.1, 0.06], [0, y, 0.15], GOLD, { metalness: 0.4 })
      for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) block(details, [0.1, height, 0.06], [x, 0, 0.15], GOLD, { metalness: 0.4 })
      collarBrackets(details, plate, levelId)
      return true
    }
    case 'curtain': {
      // Velvet folds and a gold fringe.
      const folds: number[] = []
      for (let x = -width / 2 + 0.11; x < width / 2 - 0.05; x += 0.11) folds.push(x, -height / 2 + 0.05, 0.135, x, height / 2 - 0.05, 0.135)
      details.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(folds, 3)), new THREE.LineBasicMaterial({ color: '#4d121b' }))))
      block(details, [width, 0.08, 0.05], [0, -height / 2 + 0.04, 0.15], GOLD)
      return true
    }
    case 'backdrop': {
      // A painted scene: green hills under the sky, and a sun clear of the screws.
      flat(details, [[-width / 2 + 0.02, -height / 2 + 0.02], [width / 2 - 0.02, -height / 2 + 0.02], [width / 2 - 0.02, -0.55], [0.3, -0.3], [-0.2, -0.6], [-width / 2 + 0.02, -0.35]], 0.134, '#6f9e5c')
      const sun = inert(new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), material('#f2c14e', { emissive: '#f2c14e', emissiveIntensity: 0.3 })))
      sun.position.set(0.45, 0.6, 0.134)
      details.add(sun)
      return true
    }
    case 'arch': {
      // Gilt edging and a row of lamps under the lintel.
      const outline = plate.outline ?? []
      const edging: number[] = []
      for (let index = 0; index < outline.length; index++) {
        const [ax, ay] = outline[index]!
        const [bx, by] = outline[(index + 1) % outline.length]!
        edging.push(ax * 0.96, ay * 0.97, 0.135, bx * 0.96, by * 0.97, 0.135)
      }
      details.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edging, 3)), new THREE.LineBasicMaterial({ color: GOLD }))))
      // The lintel's underside is the top of the opening: the highest vertex inside the outer legs.
      const outer = Math.max(...outline.map(([x]) => Math.abs(x)))
      const lintel = Math.max(...outline.filter(([x]) => Math.abs(x) < outer - 1e-6).map(([, y]) => y))
      if (Number.isFinite(lintel)) {
        for (let x = -width / 2 + 0.2; x < width / 2 - 0.1; x += 0.26) if (clear(screws, x, lintel + 0.12, 0.33)) bulb(details, x, lintel + 0.12, 0.17)
      }
      return true
    }
    case 'girder': {
      // Lattice bracing up each leg.
      const outline = plate.outline ?? []
      const lattice: number[] = []
      for (let y = -height / 2 + 0.1; y < height / 2 - 0.3; y += 0.3) {
        const span = outline.length ? [-1, 1].map((side) => side * (width / 2 - 0.1 - (y + height / 2) * (width / 2 - 0.55) / height)) : [-width / 2, width / 2]
        for (const x of span) lattice.push(x - 0.2, y, 0.135, x + 0.2, y + 0.3, 0.135, x + 0.2, y, 0.135, x - 0.2, y + 0.3, 0.135)
      }
      details.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lattice, 3)), new THREE.LineBasicMaterial({ color: '#7d8a92' }))))
      return true
    }
    case 'ferris': {
      // Spokes, a lit rim and a ring of bulbs, all painted on the wheel's face.
      const radius = width / 2 - 0.08
      const spokes: number[] = []
      for (let index = 0; index < 16; index++) {
        const angle = index * Math.PI / 8 + Math.PI / 16
        spokes.push(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0.135, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.135)
      }
      details.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3)), new THREE.LineBasicMaterial({ color: '#8d969b' }))))
      const ring = inert(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 8, 64), material('#d9473b', { metalness: 0.3 })))
      ring.position.z = 0.15
      details.add(ring)
      for (let index = 0; index < 32; index++) {
        const angle = index * Math.PI / 16
        const [x, y] = [Math.cos(angle) * (radius - 0.12), Math.sin(angle) * (radius - 0.12)]
        if (clear(screws, x, y, 0.33)) bulb(details, x, y, 0.17, index % 2 ? '#ffe6a0' : '#ff9fb2')
      }
      return true
    }
    case 'gondola': {
      // A roof over the car and a window band, lit from inside.
      block(details, [width + 0.12, 0.12, 0.36], [0, height / 2 + 0.02, 0], '#3d4a52', { metalness: 0.3 })
      for (const x of [-width / 2 + 0.14, width / 2 - 0.14]) {
        if (clear(screws, x, height / 2 - 0.25, 0.35)) flat(details, [[x - 0.09, height / 2 - 0.38], [x + 0.09, height / 2 - 0.38], [x + 0.09, height / 2 - 0.12], [x - 0.09, height / 2 - 0.12]], 0.136, '#ffe6a0', { emissive: '#ffd27a', emissiveIntensity: 0.6 })
      }
      return true
    }
    case 'tent': {
      // Stripes running down the slope, and a scalloped gilt edge at the front.
      const stripes = Math.round(width / 0.4)
      for (let index = 0; index < stripes; index += 2) {
        const left = -width / 2 + index * width / stripes
        flat(details, [[left, -height / 2], [left + width / stripes, -height / 2], [left + width / stripes, height / 2], [left, height / 2]], 0.136, CREAM)
      }
      block(details, [width + 0.04, 0.08, 0.07], [0, -height / 2 + 0.03, 0.15], GOLD, { metalness: 0.4 })
      return true
    }
    case 'canopy': {
      // Stripes fanning down from the point, and a gilded eave.
      const base = -height / 2
      const stripes = 6
      for (let index = 0; index < stripes; index++) {
        const left = -width / 2 + index * width / stripes
        flat(details, [[0, height / 2], [left, base], [left + width / stripes, base]], 0.136, index % 2 ? CREAM : plate.color)
      }
      block(details, [width + 0.04, 0.09, 0.07], [0, base + 0.03, 0.15], GOLD, { metalness: 0.4 })
      for (let x = -width / 2 + 0.2; x < width / 2 - 0.1; x += 0.3) bulb(details, x, base + 0.03, 0.22)
      return true
    }
    case 'rounding': {
      block(details, [width, 0.07, 0.05], [0, height / 2 - 0.05, 0.15], CREAM)
      block(details, [width, 0.07, 0.05], [0, -height / 2 + 0.05, 0.15], CREAM)
      for (let x = -width / 2 + 0.15; x < width / 2 - 0.1; x += 0.25) {
        for (const y of [height / 2 - 0.13, -height / 2 + 0.13]) if (clear(screws, x, y, 0.33)) bulb(details, x, y, 0.17)
      }
      // A painted cartouche either side of the middle.
      for (const x of [-width / 4, width / 4]) {
        if (!clear(screws, x, 0, 0.6)) continue
        const oval = inert(new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), material('#c8463d')))
        oval.scale.set(1.6, 1, 1)
        oval.position.set(x, 0, 0.135)
        details.add(oval)
      }
      return true
    }
    case 'horse': {
      // The brass pole the horse rides on, a saddle, a mane and an eye.
      const pole = inert(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 10), material(BRASS, { metalness: 0.6, roughness: 0.3 })))
      pole.position.set(0.1, 0.65, 0)
      details.add(pole)
      flat(details, [[-0.25, 0.38], [0.3, 0.38], [0.24, 0.12], [-0.2, 0.12]], 0.136, '#c8463d')
      flat(details, [[0.36, 0.42], [0.5, 0.92], [0.62, 0.94], [0.47, 0.4]], 0.136, '#7a4f30')
      const eye = inert(new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), material('#263747')))
      eye.position.set(1.0, 0.84, 0.137)
      details.add(eye)
      return true
    }
    case 'mirror': {
      // Gilt frame round mirror glass.
      flat(details, [[-width / 2 + 0.08, -height / 2 + 0.08], [width / 2 - 0.08, -height / 2 + 0.08], [width / 2 - 0.08, height / 2 - 0.08], [-width / 2 + 0.08, height / 2 - 0.08]], 0.133, '#bfe3ee', { metalness: 0.5, roughness: 0.15 })
      for (const y of [-height / 2 + 0.04, height / 2 - 0.04]) block(details, [width, 0.08, 0.05], [0, y, 0.15], GOLD, { metalness: 0.4 })
      for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) block(details, [0.08, height, 0.05], [x, 0, 0.15], GOLD, { metalness: 0.4 })
      return true
    }
    case 'rack-door': {
      // The staging rack's door: a cream border, and the rack's peg rail where it is furthest from the screws.
      for (const y of [-height / 2 + 0.04, height / 2 - 0.04]) block(details, [width, 0.08, 0.05], [0, y, 0.15], CREAM)
      for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) block(details, [0.08, height, 0.05], [x, 0, 0.15], CREAM)
      const scale = Math.min(0.17, (width - 0.3) / 3.2)
      let best: [number, number, number] = [0, 0, -Infinity]
      for (let x = -width / 2 + 0.1 + scale * 0.8; x <= width / 2 - 0.1 - scale * 0.8 + 1e-9; x += 0.02) {
        for (let y = -height / 2 + 0.1 + scale * 0.5; y <= height / 2 - 0.1 - scale * 0.5 + 1e-9; y += 0.02) {
          const room = Math.min(...screws.map((screw) => Math.hypot(Math.max(0, Math.abs(screw.position[0] - x) - scale * 0.8), Math.max(0, Math.abs(screw.position[1] - y) - scale * 0.5))))
          if (room > best[2]) best = [x, y, room]
        }
      }
      rackMark(details, best[0], best[1], 0.13, scale, CREAM)
      return true
    }
    case 'wicker': {
      // Woven bands and a rolled rim.
      const weave: number[] = []
      for (let y = -height / 2 + 0.12; y < height / 2 - 0.1; y += 0.14) weave.push(-width / 2 + 0.04, y, 0.135, width / 2 - 0.04, y, 0.135)
      for (let x = -width / 2 + 0.15; x < width / 2 - 0.1; x += 0.3) weave.push(x, -height / 2 + 0.04, 0.135, x, height / 2 - 0.04, 0.135)
      details.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(weave, 3)), new THREE.LineBasicMaterial({ color: '#8a5d2e' }))))
      const rim = block(details, [width + 0.06, 0.12, 0.12], [0, height / 2 - 0.04, 0.1], '#8a5d2e')
      rim.name = 'wicker-rim'
      return true
    }
    case 'sandbag': {
      // A tie round the neck and a stencilled band.
      block(details, [0.3, 0.06, 0.04], [0, 0.36, 0.15], '#7a4f30')
      flat(details, [[-0.4, -0.4], [0.4, -0.4], [0.4, -0.3], [-0.4, -0.3]], 0.136, '#8a5d2e')
      return true
    }
    case 'banner': {
      // A painted ride sign: a cream border and gilt corners.
      for (const y of [-height / 2 + 0.05, height / 2 - 0.05]) block(details, [width, 0.08, 0.05], [0, y, 0.15], CREAM)
      for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) block(details, [0.08, height, 0.05], [x, 0, 0.15], CREAM)
      for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) for (const y of [-height / 2 + 0.12, height / 2 - 0.12]) if (clear(screws, x, y, 0.36)) bulb(details, x, y, 0.17, GOLD)
      return true
    }
    default:
      return false
  }
}

function lawn(stage: THREE.Group, radius: number, top: number, color: string): void {
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.04, 0.2, 64), material(color, { roughness: 1 }))
  grass.position.y = top - 0.1
  grass.receiveShadow = true
  stage.add(grass)
}

/** A launch field under a striped envelope, the basket's floor on the grass and ropes up to the envelope. */
export function createBalloonField(): THREE.Group {
  const stage = new THREE.Group()
  lawn(stage, 3.2, -1.6, '#a7c48a')
  block(stage, [2.6, 0.12, 1.8], [0, -1.56, 0], '#8a5d2e')
  // The envelope: alternating gores, and the burner under its mouth.
  const gores = 12
  for (let index = 0; index < gores; index++) {
    const gore = new THREE.Mesh(new THREE.SphereGeometry(1.55, 8, 16, index * Math.PI * 2 / gores, Math.PI * 2 / gores), material(index % 2 ? CREAM : '#d9473b', { roughness: 0.7 }))
    gore.scale.set(1, 1.15, 1)
    gore.position.y = 2.75
    stage.add(gore)
  }
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.4, 16, 1, true), material('#d9473b', { side: THREE.DoubleSide }))
  mouth.position.y = 1.15
  stage.add(mouth)
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 14), material('#7d8a92', { metalness: 0.6, roughness: 0.3 }))
  burner.position.y = 0.95
  stage.add(burner)
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), material('#ffb347', { emissive: '#ff8c1a', emissiveIntensity: 0.9 }))
  flame.position.y = 1.2
  stage.add(flame)
  // Ropes from the basket's corners to the envelope.
  const ropes: number[] = []
  for (const x of [-1.25, 1.25]) for (const z of [-0.85, 0.85]) ropes.push(x, 0.56, z, x * 0.75, 1.75, z * 0.75)
  stage.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3)), new THREE.LineBasicMaterial({ color: '#6b5a44' }))))
  // A tether to a stake in the grass.
  stage.add(inert(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, -1.3, -0.8), new THREE.Vector3(-2.4, -1.6, -1.6)]), new THREE.LineBasicMaterial({ color: '#6b5a44' }))))
  block(stage, [0.08, 0.3, 0.08], [-2.4, -1.5, -1.6], '#7a5a3a')
  return stage
}

/** A showground lawn with the theater's apron, its back posts and dark wings, and bunting overhead. */
export function createShowground(): THREE.Group {
  const stage = new THREE.Group()
  lawn(stage, 3.0, -1.7, '#a7c48a')
  const apron = block(stage, [4.7, 0.2, 1.9], [0, -1.6, 0.35], '#8a6040')
  apron.raycast = THREE.Mesh.prototype.raycast
  apron.receiveShadow = true
  // The dark stage behind the backdrop, and the posts carrying the roof's back edge.
  const wings = block(stage, [4.4, 3.7, 0.08], [0, 0.35, -0.6], '#2b2433')
  wings.raycast = THREE.Mesh.prototype.raycast
  for (const x of [-2.2, 2.2]) block(stage, [0.14, 3.9, 0.14], [x, 0.4, -0.5], '#5e3b24')
  // Bunting between the back posts, above the roof.
  for (let index = 0; index < 10; index++) {
    const x = -2.0 + index * 0.44
    flat(stage, [[x - 0.13, 2.55], [x + 0.13, 2.55], [x, 2.3]], -0.5, index % 2 ? '#f2c14e' : '#d9473b', { side: THREE.DoubleSide })
  }
  return stage
}

/** The midway at night: a dark sky all round, the wheel's axle and plinth, a lit booth and strings of lamps. */
export function createMidway(): THREE.Group {
  const stage = new THREE.Group()
  const sky = inert(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: '#16203a', side: THREE.BackSide })))
  stage.add(sky)
  const stars: number[] = []
  for (let index = 0; index < 160; index++) {
    const angle = index * 2.399
    const height = 0.15 + (index * 0.618 % 1) * 0.8
    stars.push(Math.cos(angle) * 30 * Math.cos(height), 30 * Math.sin(height), Math.sin(angle) * 30 * Math.cos(height))
  }
  stage.add(inert(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)), new THREE.PointsMaterial({ color: '#fff6d8', size: 0.12 }))))
  lawn(stage, 3.0, -1.6, '#2f4a3a')
  const plinth = block(stage, [3.8, 0.12, 1.2], [0, -1.54, 0], '#5c5a55')
  plinth.raycast = THREE.Mesh.prototype.raycast
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 14), material('#8d969b', { metalness: 0.6, roughness: 0.3 }))
  axle.rotation.x = Math.PI / 2
  axle.position.set(0, 1.3, 0.1)
  stage.add(axle)
  // A lit ticket booth to one side, behind the wheel.
  block(stage, [0.8, 1.0, 0.7], [2.3, -1.1, -1.2], '#7b4fa0').raycast = THREE.Mesh.prototype.raycast
  flat(stage, [[-0.25, -0.2], [0.25, -0.2], [0.25, 0.2], [-0.25, 0.2]], 0, '#ffe6a0', { emissive: '#ffd27a', emissiveIntensity: 0.8 }).position.set(2.3, -0.95, -0.84)
  // Strings of lamps from the frame's top out to posts on the grass.
  for (const x of [-2.6, 2.6]) {
    block(stage, [0.06, 2.2, 0.06], [x, -0.5, -1.4], '#3d3a36')
    for (let step = 1; step < 10; step++) {
      const t = step / 10
      bulb(stage, x * t, 2.85 - 2.3 * t + Math.sin(t * Math.PI) * -0.35, -0.2 - 1.2 * t, step % 2 ? '#ffe6a0' : '#9fe0ff')
    }
  }
  return stage
}

/** A parade street under the float: its deck and wheels, the side rail the rack hangs on, and a pennant on top. */
export function createParade(): THREE.Group {
  const stage = new THREE.Group()
  lawn(stage, 3.0, -1.6, '#8d9296')
  const lines: number[] = []
  for (let z = -2.6; z < 2.7; z += 0.7) lines.push(-0.04, -1.595, z, 0.04, -1.595, z + 0.35)
  stage.add(inert(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({ color: '#f2efe6' }))))
  const deck = block(stage, [2.56, 0.4, 2.4], [0, -1.1, 0], '#5e3b24')
  deck.raycast = THREE.Mesh.prototype.raycast
  deck.receiveShadow = true
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.8, 0.8]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20), material('#3d3a36'))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, -1.3, z)
      stage.add(wheel)
    }
  }
  // The low rail on the left that carries the rack.
  block(stage, [0.1, 1.0, 1.9], [-1.24, -0.4, 0], '#5e3b24').raycast = THREE.Mesh.prototype.raycast
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), material('#3d3a36'))
  pole.position.set(0, 2.45, 0)
  stage.add(pole)
  flat(stage, [[0, 2.75], [0.45, 2.62], [0, 2.5]], 0, '#f2c14e', { side: THREE.DoubleSide })
  return stage
}

/** The carousel's turning deck on a fairground lawn, with its centre pole, the drum's core and the rack behind its door. */
export function createFairground(): THREE.Group {
  const stage = new THREE.Group()
  lawn(stage, 3.0, -1.8, '#9fbf86')
  // An eight-sided deck with a flat facing each way.
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.4, 8, 1, false, Math.PI / 8), material('#b7413a'))
  deck.position.y = -1.6
  deck.receiveShadow = true
  stage.add(deck)
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(1.86, 1.86, 0.03, 8, 1, false, Math.PI / 8), material('#d9b98a', { roughness: 0.9 }))
  boards.position.y = -1.405
  boards.receiveShadow = true
  stage.add(boards)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.7, 16), material(BRASS, { metalness: 0.6, roughness: 0.3 }))
  pole.position.y = 0.45
  stage.add(pole)
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), material(GOLD, { metalness: 0.6, roughness: 0.3 }))
  finial.position.y = 2.32
  stage.add(finial)
  // The drum's core behind its mirror panels, with the rack's peg rail on its right side.
  block(stage, [0.9, 1.4, 0.84], [0, -0.7, 0], '#efe0bf')
  block(stage, [0.05, 0.08, 0.6], [0.47, -0.45, 0], '#7a4f30')
  for (const z of [-0.2, 0, 0.2]) block(stage, [0.16, 0.05, 0.05], [0.53, -0.52, z], '#7a4f30')
  return stage
}
