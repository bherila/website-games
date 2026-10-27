import * as THREE from 'three'

import type { Plate } from './level'

/**
 * The permanent bases of the railway levels (16–20). Each matches its entry in
 * `STAGES` (stage.ts): the surfaces a released part lands on, with a lower floor
 * or track bed far enough below that a part tipping off the base falls clear.
 */

function block(parent: THREE.Group, size: readonly [number, number, number], position: readonly [number, number, number], color: string, shadow = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }))
  mesh.position.fromArray(position)
  mesh.receiveShadow = shadow
  parent.add(mesh)
  return mesh
}

function cylinder(parent: THREE.Group, radius: number, length: number, position: readonly [number, number, number], color: string, axis: 'x' | 'y' | 'z' = 'y', metal = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.35 : 0.8, metalness: metal ? 0.5 : 0 }))
  if (axis === 'x') mesh.rotation.z = Math.PI / 2
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  mesh.position.fromArray(position)
  parent.add(mesh)
  return mesh
}

function floor(stage: THREE.Group, radius: number, top: number, color: string): void {
  const mesh = cylinder(stage, radius, 0.1, [0, top - 0.05, 0], color)
  mesh.receiveShadow = true
}

/** Spoked wheels down one side of a chassis, with a coupling rod across their crank pins. */
function wheels(stage: THREE.Group, xs: readonly number[], z: number, y: number, radius: number, color: string, rod: boolean): void {
  const side = Math.sign(z)
  for (const x of xs) {
    cylinder(stage, radius, 0.12, [x, y, z], color, 'z')
    cylinder(stage, radius * 0.3, 0.16, [x, y, z + side * 0.03], '#d9b45a', 'z', true)
  }
  if (rod) block(stage, [xs.at(-1)! - xs[0]! + 0.2, 0.07, 0.05], [(xs[0]! + xs.at(-1)!) / 2, y - radius * 0.35, z + side * 0.1], '#c7ced2')
}

/** Rails and sleepers along X, at the given track-bed height. */
function track(stage: THREE.Group, length: number, z: number, gauge: number, top: number): void {
  for (let x = -length / 2 + 0.2; x < length / 2; x += 0.45) block(stage, [0.22, 0.06, gauge + 0.6], [x, top + 0.03, z], '#6b5440')
  for (const offset of [-gauge / 2, gauge / 2]) block(stage, [length, 0.08, 0.07], [0, top + 0.1, z + offset], '#9aa3a8')
}

/** Level 16: a wooden toy track on a playroom rug, under the engine's black chassis and red wheels. */
export function createToyTrack(): THREE.Group {
  const stage = new THREE.Group()
  floor(stage, 4.2, -2.5, '#d6c3a3')
  const border = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.06, 6, 64), new THREE.MeshStandardMaterial({ color: '#a9564a', roughness: 0.9 }))
  border.rotation.x = Math.PI / 2
  border.position.y = -2.49
  stage.add(border)
  // A beech toy track with its two grooves, running under the engine.
  block(stage, [1.8, 0.1, 6.6], [0, -2.45, 0], '#e2c48f', true)
  for (const x of [-0.5, 0.5]) block(stage, [0.12, 0.012, 6.6], [x, -2.394, 0], '#b8955e')
  block(stage, [2.3, 0.45, 2.7], [0, -1.775, 0], '#262d31', true)
  for (const side of [-1, 1]) {
    for (const z of [-0.85, 0, 0.85]) {
      cylinder(stage, 0.4, 0.12, [side * 1.22, -2.0, z], '#c0392b', 'x')
      cylinder(stage, 0.12, 0.16, [side * 1.25, -2.0, z], '#d9b45a', 'x', true)
    }
    block(stage, [0.05, 0.07, 1.9], [side * 1.32, -2.12, 0], '#c7ced2')
  }
  // The buffer beam and buffers at the front, under the smokebox.
  block(stage, [2.5, 0.3, 0.14], [0, -1.75, 1.43], '#c0392b')
  for (const x of [-0.8, 0.8]) cylinder(stage, 0.1, 0.22, [x, -1.75, 1.58], '#3d4a52', 'z', true)
  // The boiler barrel inside the casing, seen once its plates come away.
  cylinder(stage, 0.85, 2.3, [0, -0.45, 0], '#20272b', 'z')
  return stage
}

/** Level 17: a parlour table under the music box, with the brass movement inside it. */
export function createParlour(): THREE.Group {
  const stage = new THREE.Group()
  floor(stage, 4.2, -2.7, '#9c7a55')
  for (let x = -3.6; x < 3.7; x += 0.6) block(stage, [0.012, 0.004, 7], [x, -2.698, 0], '#7d5f40')
  block(stage, [4.4, 0.16, 3.0], [0, -1.63, 0], '#6e4630', true)
  for (const [x, z] of [[-2, 1.3], [2, 1.3], [-2, -1.3], [2, -1.3]] as const) block(stage, [0.14, 1.0, 0.14], [x, -2.2, z], '#5a3826')
  // Green baize under the box, and the movement on the box floor: a pinned brass cylinder and its comb.
  block(stage, [3.3, 0.02, 2.1], [0, -1.54, 0], '#2f5d4a', true)
  cylinder(stage, 0.32, 2.1, [0, -1.15, 0.2], '#c9a64b', 'x', true)
  block(stage, [2.0, 0.08, 0.45], [0, -1.35, -0.45], '#b9bec2')
  return stage
}

/** Level 18: a station platform with the clock on its stone plinth, and the track below the edge. */
export function createPlatform(): THREE.Group {
  const stage = new THREE.Group()
  floor(stage, 4.4, -2.4, '#8f877c')
  track(stage, 6.2, 2.75, 1.0, -2.4)
  block(stage, [3.8, 0.85, 3.0], [0, -1.975, 0], '#c9c0ae', true)
  block(stage, [3.82, 0.06, 0.26], [0, -1.53, 1.38], '#ece6d6')
  block(stage, [3.8, 0.012, 0.08], [0, -1.544, 1.12], '#e2b93b')
  block(stage, [2.5, 0.6, 2.1], [0, -1.25, 0], '#a89f8e', true)
  block(stage, [2.62, 0.06, 2.22], [0, -0.98, 0], '#bdb5a5', true)
  return stage
}

/** Level 19: a grassy lineside bank with the lever frame inside the signal box, and the line below. */
export function createLineside(): THREE.Group {
  const stage = new THREE.Group()
  floor(stage, 3.4, -2.4, '#8f877c')
  track(stage, 4.2, 2.2, 1.0, -2.4)
  block(stage, [3.3, 0.85, 2.8], [0, -1.975, 0], '#8fae6b', true)
  block(stage, [3.1, 0.02, 2.3], [0, -1.54, 0], '#6f6a62', true)
  // The lever frame, a row of red and blue levers, stands inside the cabin.
  for (let index = 0; index < 8; index++) {
    const lever = block(stage, [0.08, 0.9, 0.08], [-1.05 + index * 0.3, -1.1, 0.2], index % 3 === 2 ? '#3f6fb5' : '#c0392b')
    lever.rotation.x = -0.2
  }
  block(stage, [2.6, 0.2, 0.4], [0, -1.45, 0.2], '#4b4f52')
  return stage
}

/** Level 20: the main line, with the engine's and tender's chassis on it and the drag box between them. */
export function createRailway(): THREE.Group {
  const stage = new THREE.Group()
  floor(stage, 4.6, -2.4, '#8f877c')
  track(stage, 8.6, 0, 1.4, -2.4)
  block(stage, [2.4, 0.45, 1.9], [1.3, -1.775, 0], '#262d31', true)
  block(stage, [1.6, 0.45, 1.8], [-1.5, -1.775, 0], '#262d31', true)
  block(stage, [0.8, 0.2, 0.6], [-0.3, -1.65, 0], '#3d4a52', true)
  for (const z of [-1.08, 1.08]) {
    wheels(stage, [0.5, 1.3, 2.1], z, -1.95, 0.42, '#2f6f4f', true)
    wheels(stage, [-2.0, -1.0], z, -2.02, 0.34, '#2f6f4f', false)
  }
  block(stage, [0.14, 0.3, 2.1], [2.62, -1.75, 0], '#c0392b')
  for (const z of [-0.75, 0.75]) cylinder(stage, 0.1, 0.22, [2.78, -1.75, z], '#3d4a52', 'x', true)
  // The boiler barrel inside the engine, and the coal heaped in the tender.
  cylinder(stage, 0.8, 2.1, [1.3, -0.45, 0], '#20272b', 'x')
  block(stage, [1.3, 0.5, 1.5], [-1.5, 0.05, 0], '#1f1f22')
  return stage
}

/** Painted lines that never obstruct a screw's selection ray. */
function lining(parent: THREE.Group, vertices: number[], color: string): void {
  const segments = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color }))
  segments.raycast = () => {}
  parent.add(segments)
}

/**
 * Lined paintwork for the railway machines (`loco`), and polished wood with a
 * brass inlay for the music box (`lacquer`): a lined panel inset from the edge,
 * and brass bosses in the corners clear of every head on the panel. A hinged
 * lid also shows its brass knuckles along the hinge.
 */
export function decorateLined(details: THREE.Group, plate: Pick<Plate, 'size' | 'outline' | 'hinge' | 'finish'>, screws: readonly { position: readonly [number, number] }[]): void {
  const [width, height] = plate.size
  const brass = plate.finish === 'lacquer' ? '#d9b45a' : '#e2c46a'
  if (!plate.outline) {
    const x = width / 2 - 0.14
    const y = height / 2 - 0.14
    lining(details, [-x, -y, 0.135, x, -y, 0.135, x, -y, 0.135, x, y, 0.135, x, y, 0.135, -x, y, 0.135, -x, y, 0.135, -x, -y, 0.135], brass)
  }
  const boss = new THREE.MeshStandardMaterial({ color: brass, metalness: 0.6, roughness: 0.35 })
  const corners = plate.outline ?? [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]
  for (const [cx, cy] of corners) {
    const x = cx - Math.sign(cx) * 0.08
    const y = cy - Math.sign(cy) * 0.08
    if (screws.some((screw) => Math.hypot(screw.position[0] - x, screw.position[1] - y) < 0.32)) continue
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 6), boss)
    head.position.set(x, y, 0.135)
    details.add(head)
  }
  if (plate.hinge !== 'top') return
  for (const along of [-1, 1]) cylinder(details, 0.05, 0.3, [along * (width / 2 - 0.4), height / 2, 0.15], brass, 'x', true)
}
