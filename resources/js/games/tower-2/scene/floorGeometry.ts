/**
 * One merged, vertex-coloured geometry per floor, so a floor is one draw call
 * (plus one for its glass). Shading is baked per face from a fixed sun, which
 * keeps the flat neo-90s look without scene lights.
 */
import * as THREE from 'three'

import { type Building, DOOR_STEP, type Room } from '../engine/building'
import { USES } from '../engine/uses'
import { FLOOR_HEIGHT } from './isoCamera'
import { PALETTE } from './palette'

export const SLAB_THICKNESS = 0.16
const ROOM_WALL = 0.12
const ROOM_WALL_HEIGHT = 0.62
/** Glass on the active floor stays a low sill so the plan reads through it. */
export const SILL_HEIGHT = 0.3

/** Horizontal sun direction for side shading; tops are always fully lit. */
const SUN = new THREE.Vector3(0.45, 0, 0.75).normalize()

export interface FloorGeometryOptions {
  /** Full-height glass for the exterior view; a low sill otherwise. */
  glassHeight: number
  /** Selected room or core, drawn with a white outline band. */
  selectedRoomId?: number | null
  selectedCoreId?: string | null
}

class GeometryBuilder {
  private readonly positions: number[] = []
  private readonly colors: number[] = []
  private readonly indices: number[] = []
  private readonly color = new THREE.Color()

  /** An axis-aligned box in scene units; bottoms are never visible from above, so they are skipped. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number): void {
    this.color.setHex(hex)
    const { r, g, b } = this.color
    const quad = (corners: number[][], normal: [number, number, number]) => {
      const shade = normal[1] > 0 ? 1 : 0.58 + 0.42 * Math.max(0, normal[0] * SUN.x + normal[2] * SUN.z)
      const base = this.positions.length / 3
      for (const corner of corners) {
        this.positions.push(corner[0]!, corner[1]!, corner[2]!)
        this.colors.push(r * shade, g * shade, b * shade)
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0])
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1])
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0])
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0])
  }

  get empty(): boolean {
    return this.indices.length === 0
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    geometry.setIndex(this.indices)
    geometry.computeBoundingSphere()
    return geometry
  }
}

function lighten(hex: number, amount: number): number {
  const color = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount)
  return color.getHex()
}

/** Room walls with a one-tile gap for the door. */
function roomWalls(out: GeometryBuilder, room: Room, base: number, hex: number): void {
  const top = base + ROOM_WALL_HEIGHT
  const { x, y, width, depth, door, doorSide } = room
  // North and south run along x; east and west along y.
  const run = (side: typeof doorSide, from: number, to: number, emit: (a: number, b: number) => void) => {
    const doorAt = doorSide === side ? (side === 'north' || side === 'south' ? door.x : door.y) : null
    if (doorAt === null) {
      emit(from, to)
      return
    }
    if (doorAt > from) emit(from, doorAt)
    if (doorAt + 1 < to) emit(doorAt + 1, to)
  }
  run('north', x, x + width, (a, b) => out.box(a, base, y, b, top, y + ROOM_WALL, hex))
  run('south', x, x + width, (a, b) => out.box(a, base, y + depth - ROOM_WALL, b, top, y + depth, hex))
  run('west', y, y + depth, (a, b) => out.box(x, base, a, x + ROOM_WALL, top, b, hex))
  run('east', y, y + depth, (a, b) => out.box(x + width - ROOM_WALL, base, a, x + width, top, b, hex))
}

export interface FloorGeometry {
  solid: THREE.BufferGeometry | null
  glass: THREE.BufferGeometry | null
}

export function buildFloorGeometry(building: Building, floor: number, options: FloorGeometryOptions): FloorGeometry {
  const { width, depth } = building
  const base = floor * FLOOR_HEIGHT
  const plate = building.plateMask(floor)
  const below = floor > 0 ? building.plateMask(floor - 1) : null
  const corridor = building.corridorMask(floor)
  const solid = new GeometryBuilder()
  const glass = new GeometryBuilder()

  // Slab: merge each row into runs of one colour.
  const tileColor = (index: number): number | null => {
    if (plate[index] !== 1) return null
    if (corridor[index] === 1) return PALETTE.corridor
    if (below && below[index] !== 1) return PALETTE.overhang
    return PALETTE.plate
  }
  for (let y = 0; y < depth; y++) {
    let x = 0
    while (x < width) {
      const hex = tileColor(y * width + x)
      if (hex === null) {
        x++
        continue
      }
      let end = x + 1
      while (end < width && tileColor(y * width + end) === hex) end++
      solid.box(x, base - SLAB_THICKNESS, y, end, base, y + 1, hex)
      x = end
    }
  }

  for (const room of building.roomsOn(floor)) {
    const hue = USES[room.use].color
    solid.box(room.x + 0.04, base, room.y + 0.04, room.x + room.width - 0.04, base + 0.03, room.y + room.depth - 0.04, lighten(hue, 0.55))
    roomWalls(solid, room, base, options.selectedRoomId === room.id ? PALETTE.select : hue)
    const step = DOOR_STEP[room.doorSide]
    const sill = { x: room.door.x + 0.5 + step.x * 0.45, z: room.door.y + 0.5 + step.y * 0.45 }
    solid.box(sill.x - 0.3, base, sill.z - 0.3, sill.x + 0.3, base + 0.05, sill.z + 0.3, PALETTE.door)
  }

  for (const core of building.coresOn(floor)) {
    const top = base + FLOOR_HEIGHT - SLAB_THICKNESS
    const band = options.selectedCoreId === core.id ? PALETTE.select : PALETTE.coreBand
    solid.box(core.x + 0.06, base, core.y + 0.06, core.x + core.width - 0.06, top - 0.14, core.y + core.depth - 0.06, PALETTE.core)
    solid.box(core.x + 0.06, top - 0.14, core.y + 0.06, core.x + core.width - 0.06, top, core.y + core.depth - 0.06, band)
  }

  // Glass on every plate edge that faces open air (the site edge, a setback or an atrium).
  const open = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= depth || plate[y * width + x] !== 1
  const thickness = 0.06
  const glassTop = base + options.glassHeight
  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < width; x++) {
      if (plate[y * width + x] !== 1) continue
      if (open(x, y - 1)) glass.box(x, base, y, x + 1, glassTop, y + thickness, PALETTE.glass)
      if (open(x, y + 1)) glass.box(x, base, y + 1 - thickness, x + 1, glassTop, y + 1, PALETTE.glass)
      if (open(x - 1, y)) glass.box(x, base, y, x + thickness, glassTop, y + 1, PALETTE.glass)
      if (open(x + 1, y)) glass.box(x + 1 - thickness, base, y, x + 1, glassTop, y + 1, PALETTE.glass)
    }
  }

  return { solid: solid.empty ? null : solid.build(), glass: glass.empty ? null : glass.build() }
}

/** Faint tile grid and lot outline at a floor's height, for drawing on. */
export function buildGridGeometry(width: number, depth: number, floor: number): THREE.BufferGeometry {
  const y = floor * FLOOR_HEIGHT + 0.005
  const points: number[] = []
  for (let x = 0; x <= width; x++) points.push(x, y, 0, x, y, depth)
  for (let z = 0; z <= depth; z++) points.push(0, y, z, width, y, z)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}
