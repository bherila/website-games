/** Original low-poly city dressing: one static mesh and three shared prop batches. */
import * as THREE from 'three'

import type { Room } from '../engine/building'
import { type CitySite, streetLayout,type StreetProp } from './cityLayout'
import { GeometryBuilder } from './floorGeometry'

const LOT = 0x494363
const JOINT = 0x3b3654
const PAVING = 0xaaa1ad
const KERB = 0xd2c6bd
const ROAD = 0x25233a
const INK = 0x37334d
const METAL = 0x716a87
const CREAM = 0xf4e8bd
const GROUND = -0.19
const SIDEWALK = -0.06
const STREET = -0.23

/** Paint and paving joints have no side faces: keep their vertex cost as low as their draw cost. */
function paint(out: GeometryBuilder, x0: number, z0: number, x1: number, z1: number, height: number, hex: number): void {
  out.quad([[x0, height, z0], [x0, height, z1], [x1, height, z1], [x1, height, z0]], [0, 1, 0], hex)
}

function propGeometry(kind: 'tree' | 'lamp' | 'car'): THREE.BufferGeometry {
  const out = new GeometryBuilder()
  if (kind === 'tree') {
    out.box(-0.1, 0, -0.1, 0.1, 1.3, 0.1, 0x80675e)
    out.box(-0.48, 0.85, -0.42, 0.48, 1.6, 0.42, 0x589888)
    out.box(-0.34, 1.6, -0.3, 0.34, 1.95, 0.3, 0x78b29a)
  } else if (kind === 'lamp') {
    out.box(-0.1, 0, -0.1, 0.1, 0.12, 0.1, INK)
    out.box(-0.035, 0.12, -0.035, 0.035, 2.1, 0.035, METAL)
    out.box(-0.035, 2.02, 0, 0.035, 2.1, 0.5, METAL)
    out.box(-0.12, 1.98, 0.32, 0.12, 2.05, 0.62, CREAM)
  } else {
    out.box(-1.08, 0.13, -0.43, 1.08, 0.47, 0.43, 0x82b5b7)
    out.box(-0.53, 0.47, -0.36, 0.6, 0.75, 0.36, 0x48516c)
    out.box(-0.48, 0.75, -0.36, 0.55, 0.8, 0.36, 0xb8d3ce)
    for (const x of [-0.7, 0.7]) for (const z of [-0.46, 0.36]) out.box(x - 0.2, 0.04, z, x + 0.2, 0.3, z + 0.1, INK)
    for (const z of [-0.28, 0.2]) out.box(1.08, 0.29, z, 1.1, 0.4, z + 0.08, CREAM)
  }
  return out.build()
}

function furniture(out: GeometryBuilder, prop: StreetProp): void {
  const { x, y, width, depth, kind } = prop
  const top = SIDEWALK
  if (kind === 'tree') {
    out.box(x, top, y, x + width, top + 0.025, y + depth, INK)
    for (let i = 0; i < 6; i++) paint(out, x + i * width / 6, y, x + i * width / 6 + 0.035, y + depth, top + 0.035, METAL)
  } else if (kind === 'bench' || kind === 'bus-stop') {
    const left = kind === 'bus-stop' ? x + 0.25 : x
    const right = kind === 'bus-stop' ? x + width - 0.25 : x + width
    for (const z of [y + 0.04, y + 0.22, y + 0.4]) out.box(left, top + 0.32, z, right, top + 0.39, z + 0.09, 0xc2a07e)
    for (const px of [left + 0.12, right - 0.2]) out.box(px, top, y + 0.06, px + 0.08, top + 0.32, y + depth - 0.06, INK)
    out.box(left, top + 0.52, y + depth - 0.08, right, top + 0.64, y + depth, 0xc2a07e)
    if (kind === 'bus-stop') {
      for (const px of [x, x + width - 0.06]) out.box(px, top, y + depth - 0.06, px + 0.06, top + 1.3, y + depth, METAL)
      out.box(x - 0.12, top + 1.3, y - 0.1, x + width + 0.12, top + 1.4, y + depth + 0.12, 0x6f8195)
      out.box(x + width - 0.38, top + 0.68, y + depth - 0.1, x + width - 0.09, top + 1.2, y + depth - 0.04, CREAM)
      // A simple transit pictogram, not a real operator's logo or route.
      out.box(x + width - 0.33, top + 0.9, y + depth - 0.12, x + width - 0.14, top + 1.06, y + depth - 0.1, INK)
    }
  }
}

function neighbor(out: GeometryBuilder, x: number, z: number, width: number, depth: number, height: number, hue: number): void {
  out.box(x, GROUND, z, x + width, height, z + depth, hue)
  out.box(x - 0.08, height, z - 0.08, x + width + 0.08, height + 0.12, z + depth + 0.08, 0x77718b)
  for (let h = 0.45; h < height - 0.3; h += 0.85) {
    for (let px = x + 0.45; px < x + width - 0.3; px += 1.1) {
      out.quad([[px + 0.55, h, z - 0.025], [px, h, z - 0.025], [px, h + 0.38, z - 0.025], [px + 0.55, h + 0.38, z - 0.025]], [0, 0, -1], 0x87839a)
    }
  }
  out.box(x + 0.5, height + 0.12, z + 0.5, x + 1.3, height + 0.4, z + 1.2, 0x625b78)
}

export function buildCityContext(site: CitySite, entrance: { x: number, y: number } | null, rooms: readonly Pick<Room, 'floor' | 'storefront' | 'door'>[]): THREE.Group {
  const { width, depth } = site
  const layout = streetLayout(site, entrance, rooms)
  const out = new GeometryBuilder()
  out.box(-2, GROUND - 0.18, -2, width + 2, GROUND, depth, LOT)
  // Fine joints, and occasional warm pavers, give the site material without a bitmap.
  for (let x = 0; x <= width; x += 2) paint(out, x, -2, x + 0.025, depth, GROUND + 0.004, JOINT)
  for (let z = 0; z < depth; z += 2) paint(out, -2, z, width + 2, z + 0.025, GROUND + 0.004, JOINT)
  out.box(-12, STREET - 0.15, depth + 2, width + 12, STREET, depth + 8, ROAD)
  out.box(1.5, GROUND - 0.1, depth, width - 1.5, SIDEWALK, depth + 2, PAVING)
  out.box(1.5, GROUND - 0.1, depth + 1.9, width - 1.5, SIDEWALK + 0.025, depth + 2.06, KERB)
  for (const [x0, x1] of [[0, 1.5], [width - 1.5, width]]) {
    out.quad([[x0!, SIDEWALK, depth], [x0!, STREET, depth + 2], [x1!, STREET, depth + 2], [x1!, SIDEWALK, depth]], [0, 1, 0], KERB)
    out.quad([[x0!, GROUND - 0.1, depth], [x0!, STREET, depth + 2], [x0!, SIDEWALK, depth], [x0!, SIDEWALK, depth]], [-1, 0, 0], PAVING)
    out.quad([[x1!, STREET, depth + 2], [x1!, GROUND - 0.1, depth], [x1!, SIDEWALK, depth], [x1!, SIDEWALK, depth]], [1, 0, 0], PAVING)
  }
  for (let x = 2; x < width - 1.5; x += 1.5) paint(out, x, depth + 0.04, x + 0.018, depth + 1.88, SIDEWALK + 0.006, 0x878092)
  // Markings are painted faces, never collision or simulation objects.
  for (let x = -10; x < width + 10; x += 3) {
    if (layout.approaches.some(gap => x < gap.x1 && x + 1.5 > gap.x0)) continue
    paint(out, x, depth + 4.96, x + 1.5, depth + 5.04, STREET + 0.01, CREAM)
  }
  for (let z = depth + 2.3; z < depth + 7.8; z += 0.7) paint(out, layout.crosswalkX - 1.1, z, layout.crosswalkX + 1.1, z + 0.35, STREET + 0.012, CREAM)
  out.box(-12, STREET - 0.1, depth + 8, width + 12, SIDEWALK, depth + 10, PAVING)
  for (let x = -6, i = 0; x < width + 8; x += 8, i++) neighbor(out, x, depth + 10.5, 6, 5, 2.1 + i % 3 * 0.6, i % 2 ? 0x5b566f : 0x655d79)
  // Side blocks stay low and outside the editable site at every rotation.
  neighbor(out, -10, depth * 0.6, 5, 7, 1.65, 0x5f5a75)
  neighbor(out, width + 5, depth * 0.6, 5, 7, 1.65, 0x645e78)
  for (const prop of layout.props) furniture(out, prop)
  const group = new THREE.Group()
  group.name = 'city-context'
  // Normal views can use opaque depth-tested rendering; blending is needed
  // only for the basement fade, avoiding full-surface alpha work while idle.
  const material = () => new THREE.MeshBasicMaterial({ vertexColors: true })
  const staticMesh = new THREE.Mesh(out.build(), material())
  staticMesh.name = 'city-static'
  staticMesh.renderOrder = 1
  group.add(staticMesh)
  const scratch = new THREE.Object3D()
  for (const kind of ['tree', 'lamp', 'car'] as const) {
    const props = layout.props.filter(prop => prop.kind === kind)
    if (!props.length) continue
    const instances = new THREE.InstancedMesh(propGeometry(kind), material(), props.length)
    instances.name = `city-${kind}`
    props.forEach((prop, i) => {
      scratch.position.set(prop.x + prop.width / 2, kind === 'car' ? STREET : SIDEWALK, prop.y + prop.depth / 2)
      scratch.updateMatrix()
      instances.setMatrixAt(i, scratch.matrix)
    })
    group.add(instances)
  }
  return group
}
