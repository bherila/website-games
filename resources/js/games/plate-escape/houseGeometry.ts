import * as THREE from 'three'

import { dialSlotPosition } from './dial'
import { decorateHarborPlate } from './harborDecals'
import { heldPlates, type Plate, type PuzzleLevel, type Screw } from './level'
import { createLineside, createParlour, createPlatform, createRailway, createToyTrack, decorateLined } from './railwayScenery'
import type { StageId } from './stage'

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
  if (plate.finish === 'wheel' || plate.dial) {
    shape.absarc(0, 0, width / 2, 0, Math.PI * 2, false)
    return shape
  }
  if (plate.outline) {
    shape.setFromPoints(plate.outline.map(([px, py]) => new THREE.Vector2(px, py)))
    shape.closePath()
    return shape
  }
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

/** Depth from a wall's centre plane to its outer face, matching createPlateMesh's extrusion. */
export const PANEL_FACE = 0.13

/**
 * Covers stand off their wall; two blocks behind the ends bolt them to it.
 * They sit outboard of every wall screw so no head's access ray crosses one.
 */
function spacers(parent: THREE.Group, plate: Plate, standoff: number, color: string): void {
  const length = standoff - PANEL_FACE * 2
  for (const side of [-1, 1]) {
    const block = box(parent, [0.16, 0.62, length], [side * (plate.size[0] / 2 - 0.16), 0, -PANEL_FACE - length / 2], color)
    block.userData.spacer = true
  }
}

function shade(color: string, lightness: number): string {
  return `#${new THREE.Color(color).offsetHSL(0, 0, lightness).getHexString()}`
}

/** Painted lines that never obstruct a screw's selection ray. */
function lines(parent: THREE.Group, vertices: number[], color: string): void {
  const segments = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color }))
  segments.raycast = () => {}
  parent.add(segments)
}

/** Overlapping strakes on both faces and a rubbing strip along the sheer of a shaped hull panel. */
function decorateHull(details: THREE.Group, plate: Plate): void {
  const [width, height] = plate.size
  const strakes: number[] = []
  for (let y = -height / 2 + 0.25; y < height / 2 - 0.1; y += 0.25) {
    for (const z of [0.135, -0.135]) strakes.push(-width / 2 + 0.05, y, z, width / 2 - 0.05, y, z)
  }
  // Clip the strakes to the shaped outline by drawing only their inside spans.
  const outline = plate.outline ?? [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]
  const clipped: number[] = []
  for (let index = 0; index < strakes.length; index += 6) {
    const y = strakes[index + 1]!
    const crossings: number[] = []
    for (let a = 0, b = outline.length - 1; a < outline.length; b = a++) {
      const [ax, ay] = outline[a]!
      const [bx, by] = outline[b]!
      if ((ay > y) !== (by > y)) crossings.push(ax + (y - ay) * (bx - ax) / (by - ay))
    }
    if (crossings.length < 2) continue
    clipped.push(Math.min(...crossings) + 0.05, y, strakes[index + 2]!, Math.max(...crossings) - 0.05, y, strakes[index + 2]!)
  }
  lines(details, clipped, shade(plate.color, -0.15))
  // The top edge of the outline is the sheer: a pale rubbing strip follows it.
  const [right, left] = [outline[2]!, outline[3]!]
  const strip = box(details, [Math.hypot(right[0] - left[0], right[1] - left[1]), 0.09, 0.08], [(right[0] + left[0]) / 2, (right[1] + left[1]) / 2 - 0.045, 0.15], '#f1e7d2')
  strip.rotation.z = Math.atan2(right[1] - left[1], right[0] - left[0])
}

/** A solid-shrouded waterwheel: rim, spokes, a hub ring and paddles round the edge. */
function decorateWheel(details: THREE.Group, plate: Plate): void {
  const radius = plate.size[0] / 2
  const dark = shade(plate.color, -0.12)
  const light = shade(plate.color, 0.08)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.08, 0.06, 8, 48), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7 }))
  rim.position.z = 0.13
  details.add(rim)
  const hub = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6 }))
  hub.position.z = 0.14
  details.add(hub)
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4 + Math.PI / 8
    const spoke = box(details, [radius - 0.45, 0.09, 0.05], [Math.cos(angle) * (radius + 0.27) / 2, Math.sin(angle) * (radius + 0.27) / 2, 0.14], light)
    spoke.rotation.z = angle
  }
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6
    const paddle = box(details, [0.15, 0.05, 0.24], [Math.cos(angle) * (radius - 0.075), Math.sin(angle) * (radius - 0.075), 0.24], dark)
    paddle.rotation.z = angle
  }
}

/** Vertical boards on two ledges with a diagonal brace; iron straps and knuckles on a hinged edge. */
function decoratePlanks(details: THREE.Group, plate: Plate): void {
  const [width, height] = plate.size
  const grooves: number[] = []
  const boards = Math.max(2, Math.round(width / 0.3))
  for (let index = 1; index < boards; index++) {
    const x = -width / 2 + index * width / boards
    // Both faces: an open door or hatch shows its back.
    for (const z of [0.135, -0.135]) grooves.push(x, -height / 2 + 0.04, z, x, height / 2 - 0.04, z)
  }
  lines(details, grooves, shade(plate.color, -0.18))
  const ledge = shade(plate.color, 0.1)
  const rail = Math.min(0.14, height / 6)
  const inset = Math.min(0.2, height / 4)
  for (const y of [-height / 2 + inset, height / 2 - inset]) box(details, [width - 0.1, rail, 0.05], [0, y, 0.15], ledge)
  const rise = height - inset * 2
  const run = width - 0.3
  const brace = box(details, [Math.hypot(run, rise) - rail, rail * 0.8, 0.045], [0, 0, 0.15], ledge)
  brace.rotation.z = Math.atan2(rise, run) * (plate.hinge === 'right' ? -1 : 1)
  if (!plate.hinge) return
  const iron = '#3d3a36'
  const vertical = plate.hinge === 'left' || plate.hinge === 'right'
  const edge = plate.hinge === 'left' ? -width / 2 : plate.hinge === 'right' ? width / 2 : plate.hinge === 'top' ? height / 2 : -height / 2
  const reach = (vertical ? width : height) * 0.45
  for (const along of [-1, 1]) {
    const offset = along * ((vertical ? height : width) / 2 - inset)
    const strap = vertical
      ? box(details, [reach, 0.07, 0.03], [edge - Math.sign(edge) * reach / 2, offset, 0.19], iron)
      : box(details, [0.07, reach, 0.03], [offset, edge - Math.sign(edge) * reach / 2, 0.19], iron)
    strap.userData.hingeStrap = true
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), new THREE.MeshStandardMaterial({ color: iron, metalness: 0.5, roughness: 0.5 }))
    if (vertical) knuckle.position.set(edge, offset, 0.15)
    else {
      knuckle.position.set(offset, edge, 0.15)
      knuckle.rotation.z = Math.PI / 2
    }
    details.add(knuckle)
  }
}

/** Painted sheet steel: rivets round the edge and a hazard band along the top, above anything stacked on it. */
function decorateGuard(details: THREE.Group, plate: Plate): void {
  const [width, height] = plate.size
  const rivet = new THREE.MeshStandardMaterial({ color: '#d7dde0', metalness: 0.6, roughness: 0.35 })
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) for (const y of [-height / 2 + 0.1, height / 2 - 0.1]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), rivet)
    head.position.set(x, y, 0.135)
    details.add(head)
  }
  const stripes = Math.floor((width - 0.2) / 0.2)
  for (let index = 0; index < stripes; index++) {
    const stripe = box(details, [0.1, 0.14, 0.012], [-width / 2 + 0.2 + index * 0.2, height / 2 - 0.16, 0.136], index % 2 ? '#3c4a52' : '#f2c14e')
    stripe.rotation.z = 0.5
  }
}

/** A woodpile seen end-on: log ends in two rows, clear of every screw head on the rack. */
function decorateRack(details: THREE.Group, plate: Plate, screws: readonly Screw[]): void {
  const [width, height] = plate.size
  const end = new THREE.MeshStandardMaterial({ color: '#dcb47e', roughness: 0.85 })
  const bark = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.9 })
  for (const [row, y] of [-height / 4, height / 4].entries()) {
    for (let x = -width / 2 + 0.22 + row * 0.18; x < width / 2 - 0.2; x += 0.36) {
      if (screws.some((screw) => Math.hypot(screw.position[0] - x, screw.position[1] - y) < 0.45)) continue
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16), end)
      log.rotation.x = Math.PI / 2
      log.position.set(x, y, 0.16)
      details.add(log)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), bark)
      ring.position.set(x, y, 0.21)
      details.add(ring)
    }
  }
}

/**
 * A cast weight shaped like a pinecone: staggered rows of scales, clear of its
 * screw, and a ring at the top where the cord is tied.
 */
function decorateWeight(details: THREE.Group, plate: Plate, screws: readonly Screw[]): void {
  const [width, height] = plate.size
  const scale = new THREE.MeshStandardMaterial({ color: shade(plate.color, 0.1), roughness: 0.8 })
  for (let row = 0, y = height / 2 - 0.16; y > -height / 2 + 0.1; row++, y -= 0.13) {
    for (let x = -width / 2 + 0.1 + (row % 2) * 0.07; x < width / 2 - 0.08; x += 0.14) {
      if (screws.some((screw) => Math.hypot(screw.position[0] - x, screw.position[1] - y) < 0.34)) continue
      if (plate.outline && !insidePolygon(plate.outline, x, y, 0.06)) continue
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), scale)
      bump.scale.set(1, 0.7, 0.45)
      bump.position.set(x, y, 0.14)
      details.add(bump)
    }
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 16), new THREE.MeshStandardMaterial({ color: '#b08d3c', metalness: 0.6, roughness: 0.35 }))
  ring.position.set(0, height / 2 + 0.04, 0)
  details.add(ring)
}

/** Whether a point lies inside a polygon with at least `margin` to spare along each axis. */
function insidePolygon(outline: readonly (readonly [number, number])[], x: number, y: number, margin = 0): boolean {
  const inside = (px: number, py: number): boolean => {
    let result = false
    for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
      const [ax, ay] = outline[index]!
      const [bx, by] = outline[previous]!
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) result = !result
    }
    return result
  }
  return [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]].every(([dx, dy]) => inside(x + dx!, y + dy!))
}

/** All architectural details belong to their panel, so they leave with it. */
export function decoratePlate(plate: Plate, standoff = 0, screws: readonly Screw[] = [], levelId?: number): THREE.Group {
  const details = new THREE.Group()
  decorateHarborPlate(details, plate, levelId)
  const [width, height] = plate.size
  const cream = '#fff2d7'
  if (plate.finish === 'wheel') {
    decorateWheel(details, plate)
    return details
  }
  if (plate.dial) {
    decorateDial(details, plate)
    return details
  }
  if (plate.finish === 'loco' || plate.finish === 'lacquer') {
    decorateLined(details, plate, screws)
    return details
  }
  if (plate.finish === 'weight') {
    decorateWeight(details, plate, screws)
    return details
  }
  if (plate.finish === 'plank') {
    decoratePlanks(details, plate)
    return details
  }
  if (plate.finish === 'guard') {
    decorateGuard(details, plate)
    return details
  }
  if (plate.finish === 'rack') {
    decorateRack(details, plate, screws)
    return details
  }
  if (plate.finish === 'hull') {
    decorateHull(details, plate)
    return details
  }
  if (plate.finish === 'stone') {
    const joints: number[] = []
    const courses = Math.max(2, Math.round(height / 0.2))
    for (let row = 0; row < courses; row++) {
      const y = -height / 2 + (row + 1) * height / courses
      if (row < courses - 1) joints.push(-width / 2 + 0.04, y, 0.135, width / 2 - 0.04, y, 0.135)
      for (let x = -width / 2 + (row % 2 ? 0.2 : 0.4); x < width / 2 - 0.1; x += 0.4) joints.push(x, y - height / courses, 0.135, x, y, 0.135)
    }
    lines(details, joints, shade(plate.color, -0.18))
    box(details, [width + 0.04, 0.08, 0.06], [0, height / 2 - 0.02, 0.15], shade(plate.color, 0.05))
    return details
  }
  if (plate.finish === 'beam') {
    const grain: number[] = []
    for (const y of [-height / 4, 0.03, height / 4]) grain.push(-width / 2 + 0.12, y, 0.135, width / 2 - 0.12, y - 0.02, 0.135)
    lines(details, grain, shade(plate.color, -0.12))
    for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) box(details, [0.06, height - 0.04, 0.03], [x, 0, 0.14], shade(plate.color, -0.08))
    return details
  }
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
    if (plate.finish === 'glass' && standoff > 0) spacers(details, plate, standoff, frame)
    if (plate.finish === 'awning') {
      for (const x of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) box(details, [0.20, height - 0.08, 0.025], [x, 0, 0.14], '#c46e5b')
    } else if (plate.finish !== 'glass') {
      box(details, [0.045, height - 0.08, 0.045], [0, 0, 0.14], frame)
      box(details, [width - 0.08, 0.045, 0.045], [0, -0.25, 0.14], frame)
    }
    return details
  }
  if (plate.finish === 'brace') {
    if (standoff > 0) spacers(details, plate, standoff, '#94653e')
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

/** The permanent scenery a level stands on; its surfaces match `STAGES` in stage.ts. */
export function createStage(level: Pick<PuzzleLevel, 'stage' | 'theme'>): THREE.Group {
  return SCENERY[level.stage ?? 'garden'](level.theme)
}

/** A boat's permanent lower hull, afloat: painted sides, a waterline stripe and its bottom boards. */
function lowerHull(stage: THREE.Group, size: readonly [number, number, number], top: number, color: string, stripe: string): void {
  const [length, depth, beam] = size
  const hull = box(stage, [length, depth, beam], [0, top - depth / 2 - 0.02, 0], color)
  hull.receiveShadow = true
  box(stage, [length + 0.02, 0.06, beam + 0.02], [0, -1.86, 0], stripe)
  const boards = box(stage, [length - 0.1, 0.04, beam - 0.1], [0, top - 0.02, 0], '#c9a979')
  boards.receiveShadow = true
}

const water = (radius: number, y: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 64), new THREE.MeshStandardMaterial({ color: '#6fa9c4', roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88 }))
  mesh.position.y = y - 0.03
  mesh.receiveShadow = true
  return mesh
}

/** A harbor with a plank jetty; the dinghy's lower hull and bottom boards stay afloat beside it. */
function createJetty(): THREE.Group {
  const stage = new THREE.Group()
  stage.add(water(4.2, -1.86))
  // The lower hull, down to the waterline and below, carries the bottom boards at -1.45.
  lowerHull(stage, [3.4, 0.5, 2.1], -1.45, '#2f5f74', '#c4573f')
  for (const z of [-0.6, -0.2, 0.2, 0.6]) box(stage, [3.25, 0.012, 0.012], [0, -1.448, z], '#a88a5f')
  box(stage, [3.8, 0.12, 0.16], [-0.1, -1.95, 0], '#26495a')
  // The jetty behind the boat, on piles, with mooring posts and a coil of rope.
  const deck = box(stage, [6.4, 0.12, 1.1], [0, -1.68, -2.15], '#a98762')
  deck.receiveShadow = true
  for (let x = -3; x <= 3.01; x += 0.4) box(stage, [0.012, 0.01, 1.08], [x, -1.618, -2.15], '#8a6b4a')
  for (const x of [-2.9, -1.2, 1.2, 2.9]) {
    for (const z of [-1.65, -2.65]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10), new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 }))
      pile.position.set(x, z === -1.65 ? -1.35 : -1.95, z)
      stage.add(pile)
    }
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 20), new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 0.9 }))
  rope.rotation.x = Math.PI / 2
  rope.position.set(2.3, -1.58, -2.3)
  stage.add(rope)
  return stage
}

/** A boathouse bench on a plank floor; the chest's bottom and its contents stay on it. */
function createWorkbench(): THREE.Group {
  const stage = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.1, 48), new THREE.MeshStandardMaterial({ color: '#b99a72', roughness: 0.95 }))
  floor.position.y = -2.75
  floor.receiveShadow = true
  stage.add(floor)
  const top = box(stage, [4.6, 0.16, 2.9], [0, -1.63, 0], '#c79a63')
  top.receiveShadow = true
  for (const z of [-0.95, 0, 0.95]) box(stage, [4.58, 0.008, 0.012], [0, -1.548, z], '#9c7445')
  for (const [x, z] of [[-2.1, 1.25], [2.1, 1.25], [-2.1, -1.25], [2.1, -1.25]]) box(stage, [0.16, 1.05, 0.16], [x!, -2.2, z!], '#8a6440')
  // Inside the chest: its bottom, a coil of rope and a folded blanket.
  box(stage, [2.9, 0.06, 1.7], [0, -1.52, 0], '#5e3b24')
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 22), new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 0.9 }))
  rope.rotation.x = Math.PI / 2
  rope.position.set(-0.6, -1.4, 0)
  stage.add(rope)
  box(stage, [0.9, 0.22, 0.7], [0.7, -1.38, 0.05], '#4f6f8a')
  return stage
}

/** A stone quay at the harbor's edge, with two bollards clear of where the jib lands. */
function createQuay(): THREE.Group {
  const stage = new THREE.Group()
  stage.add(water(4.4, -2.2))
  const quay = box(stage, [5.2, 0.7, 3.4], [-0.6, -1.9, 0], '#c4bcab')
  quay.receiveShadow = true
  for (let x = -3.0; x < 1.9; x += 0.65) box(stage, [0.012, 0.02, 3.38], [x, -1.545, 0], '#a69e8f')
  box(stage, [0.14, 0.1, 3.42], [1.98, -1.53, 0], '#e2dccf')
  // The freed jib tips forward onto the quay along +z, so the bollards stand behind the tower and
  // at the far end of the quay.
  for (const [x, z] of [[1.6, -1.3], [-2.6, 1.3]] as const) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 14), new THREE.MeshStandardMaterial({ color: '#3d4a52', roughness: 0.6, metalness: 0.4 }))
    bollard.position.set(x, -1.35, z)
    stage.add(bollard)
  }
  return stage
}

/** Open water with the lightship's lower hull, its mast and lamp housing, and a marker buoy. */
function createSea(): THREE.Group {
  const stage = new THREE.Group()
  stage.add(water(4.4, -1.86))
  lowerHull(stage, [3.6, 0.55, 2.1], -1.45, '#9e2f2a', '#2b2b2b')
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 12), new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.6 }))
  mast.position.set(-0.6, 0.25, 0)
  stage.add(mast)
  // The lamp housing behind the lantern glass, with its lens lit.
  box(stage, [0.85, 0.85, 0.42], [-0.6, 1.45, 0], '#3d4a52')
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 18), new THREE.MeshStandardMaterial({ color: '#f6dc8a', emissive: '#f2c14e', emissiveIntensity: 0.7 }))
  lens.rotation.x = Math.PI / 2
  lens.position.set(-0.6, 1.45, 0.2)
  stage.add(lens)
  box(stage, [1.0, 0.1, 0.6], [-0.6, 1.92, 0], '#2f383e')
  const buoy = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#d9473b', roughness: 0.5 }))
  buoy.position.set(2.8, -1.6, 1.6)
  stage.add(buoy)
  return stage
}

/** A round stone pier head above the sea, with the lantern's stone drum and its lamp. */
function createPier(): THREE.Group {
  const stage = new THREE.Group()
  stage.add(water(4.2, -2.3))
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#cfc6b4', roughness: 0.95 }))
  head.position.y = -1.7
  head.receiveShadow = true
  stage.add(head)
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.5, 48), new THREE.MeshStandardMaterial({ color: '#9d978a', roughness: 1, flatShading: true }))
  footing.position.y = -2.1
  footing.receiveShadow = true
  stage.add(footing)
  for (const [x, z, radius] of [[-2.2, 1.1, 0.32], [2.3, 0.6, 0.28], [-1.9, -1.6, 0.36], [1.8, -1.7, 0.3]]) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 1, flatShading: true }))
    rock.position.set(x!, -1.88, z!)
    stage.add(rock)
  }
  // The drum behind the removable base panels, and the lamp the glazing protects.
  box(stage, [1.9, 0.85, 1.9], [0, -1.12, 0], '#c9c0ae')
  box(stage, [2.0, 0.08, 2.0], [0, -0.68, 0], '#9e968a')
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.75, 16), new THREE.MeshStandardMaterial({ color: '#f6dc8a', emissive: '#f2c14e', emissiveIntensity: 0.6, roughness: 0.3 }))
  lamp.position.y = -0.2
  stage.add(lamp)
  box(stage, [0.5, 0.18, 0.5], [0, -0.55, 0], '#5c5a55')
  return stage
}

/** A permanent garden plinth grounds the removable house panels. */
export function createGarden(theme?: PuzzleLevel['theme']): THREE.Group {
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
  if (theme === 'millrace') {
    // The race runs across the lawn under the wheel, between stone kerbs, in place of the steps.
    box(garden, [3.2, 0.02, 0.6], [0, -1.75, 1.95], '#7fb8d6')
    for (const z of [1.62, 2.28]) box(garden, [3.2, 0.06, 0.07], [0, -1.73, z], '#b9b3a6')
  } else {
    box(garden, [0.94, 0.13, 0.42], [0, -1.69, 1.57], '#dfcdb0')
    box(garden, [0.72, 0.07, 0.37], [0, -1.73, 2.04], '#e4d4b7')
  }
  if (theme === 'barn') {
    for (const [x, z] of [[-2.25, 0.1], [2.25, -0.2]]) {
      box(garden, [0.42, 0.34, 0.66], [x!, -1.59, z!], '#e3c46a')
      for (const offset of [-0.18, 0.18]) box(garden, [0.43, 0.35, 0.02], [x!, -1.59, z! + offset], '#b8913c')
    }
  }
  if (theme === 'sawmill') {
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 14), new THREE.MeshStandardMaterial({ color: '#7b5434', roughness: 0.9 }))
    stump.position.set(-2.2, -1.61, 0.25)
    garden.add(stump)
    for (const [index, [y, z]] of [[-1.66, -0.12], [-1.66, 0.12], [-1.46, 0]].entries()) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 12), new THREE.MeshStandardMaterial({ color: index === 2 ? '#8a6040' : '#7b5434', roughness: 0.9 }))
      log.rotation.z = Math.PI / 2
      log.position.set(2.2, y!, 0.25 + z!)
      garden.add(log)
    }
  }
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


const SCENERY: Record<StageId, (theme?: PuzzleLevel['theme']) => THREE.Group> = {
  garden: createGarden,
  jetty: createJetty,
  pier: createPier,
  workbench: createWorkbench,
  quay: createQuay,
  sea: createSea,
  'toy-track': createToyTrack,
  parlour: createParlour,
  platform: createPlatform,
  lineside: createLineside,
  railway: createRailway,
}

const plateById = (plates: readonly Plate[], id: string): Plate => plates.find((plate) => plate.id === id)!

/** Where a screw's axis crosses a plate it pins, in that plate's local X/Y. */
export function screwAnchorOn(screw: Screw, plate: Plate, plates: readonly Plate[]): readonly [number, number] {
  if (screw.plate === plate.id) return screw.position
  const head = plateById(plates, screw.plate)
  const world = new THREE.Vector3(...screw.position, 0).applyQuaternion(plateQuaternion(head)).add(new THREE.Vector3().fromArray(head.position))
  const local = world.sub(new THREE.Vector3().fromArray(plate.position)).applyQuaternion(plateQuaternion(plate).invert())
  return [local.x, local.y]
}

/**
 * A screw through several parts shows its shank between them: from behind the
 * head plate to the face of the deepest plate it pins. It belongs to the head
 * plate, so it leaves with that part, and it lies on the screw's own axis.
 */
export function throughShafts(plate: Plate, screws: readonly Screw[], plates: readonly Plate[]): THREE.Mesh[] {
  const normal = new THREE.Vector3().fromArray(plate.normal)
  return screws.filter((screw) => screw.plate === plate.id && screw.through?.length).flatMap((screw) => {
    const deepest = plateById(plates, heldPlates(screw).at(-1)!)
    const length = new THREE.Vector3().fromArray(plate.position).sub(new THREE.Vector3().fromArray(deepest.position)).dot(normal) - PANEL_FACE * 2
    if (length <= 0) return []
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 12), new THREE.MeshStandardMaterial({ color: '#8d969b', metalness: 0.6, roughness: 0.35 }))
    shaft.rotation.x = Math.PI / 2
    shaft.position.set(screw.position[0], screw.position[1], -PANEL_FACE - length / 2)
    shaft.userData.shaft = screw.id
    return [shaft]
  })
}

/** A dial's windows are cut wide enough to show a whole head and washer square on. */
export const DIAL_WINDOW = 0.32
/** A dial is a thin plate, so a head can be seen through its window from well off square. */
export const DIAL_FACE = 0.04

/** A brass dial: a rim and a grip in the middle, both clear of the windows. */
function decorateDial(details: THREE.Group, plate: Plate): void {
  const radius = plate.size[0] / 2
  const dark = shade(plate.color, -0.18)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.03, 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: dark, metalness: 0.5, roughness: 0.4 }))
  rim.position.z = DIAL_FACE
  details.add(rim)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 20), new THREE.MeshStandardMaterial({ color: dark, metalness: 0.5, roughness: 0.35 }))
  grip.rotation.x = Math.PI / 2
  grip.position.z = DIAL_FACE + 0.11
  details.add(grip)
  // A dial held by a stop pin has a red stop on its rim at the top, where it rests against the pin
  // above the dial until the pin comes out. It turns with the disc.
  if (plate.dial?.pins?.length) {
    const stop = box(details, [0.16, 0.14, 0.08], [0, radius - 0.1, DIAL_FACE + 0.04], '#c0392b')
    stop.userData.dialStop = true
  }
}

/** Distance from a cover to the parallel wall behind it, or 0 when it has none. */
export function coverStandoff(plate: Plate, plates: readonly Plate[]): number {
  if (plate.finish !== 'brace' && plate.finish !== 'glass') return 0
  const normal = new THREE.Vector3().fromArray(plate.normal)
  const offsets = plates.filter((wall) => wall.id !== plate.id && wall.finish !== plate.finish && new THREE.Vector3().fromArray(wall.normal).dot(normal) > 0.999)
    .map((wall) => new THREE.Vector3().fromArray(plate.position).sub(new THREE.Vector3().fromArray(wall.position)).dot(normal))
    .filter((offset) => offset > 0)
  return offsets.length ? Math.min(...offsets) : 0
}

/** The same panel body is used for rendering and geometry/access verification. */
export function createPlateMesh(plate: Plate, screws: readonly Screw[]): THREE.Mesh {
  const shape = plateOutline(plate)
  const holes = [
    ...screws.map((screw) => [screw.position, 0.14] as const),
    ...(plate.dial?.windows ?? []).map((slot) => [dialSlotPosition(plate.dial!, slot), DIAL_WINDOW] as const),
  ]
  for (const [[x, y], radius] of holes) {
    const hole = new THREE.Path()
    hole.absarc(x, y, radius, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const depth = plate.dial ? DIAL_FACE : 0.18
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: plate.dial ? 0.02 : 0.05, bevelThickness: plate.dial ? DIAL_FACE / 2 : PANEL_FACE - 0.09, bevelSegments: 2, steps: 1 })
  geometry.translate(0, 0, -depth / 2)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: plate.color, metalness: plate.translucent ? 0 : 0.12, roughness: plate.translucent ? 0.12 : 0.45, transparent: Boolean(plate.translucent), opacity: plate.translucent ? 0.22 : 1, depthWrite: !plate.translucent, side: plate.translucent ? THREE.DoubleSide : THREE.FrontSide }))
  mesh.castShadow = !plate.translucent
  mesh.receiveShadow = true
  if (plate.translucent) mesh.userData.glassPlateName = plate.name
  return mesh
}
