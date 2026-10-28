/**
 * One merged, vertex-coloured geometry per floor, so a floor is one draw call
 * (plus one for its glass). Shading is baked per face from a fixed sun, which
 * keeps the flat neo-90s look without scene lights.
 */
import * as THREE from 'three'

import { type Building, DOOR_STEP, type Facing, FACINGS, type Room } from '../engine/building'
import { USES } from '../engine/uses'
import { FLOOR_HEIGHT } from './isoCamera'
import { PALETTE } from './palette'

export const SLAB_THICKNESS = 0.16
const ROOM_WALL = 0.12
const ROOM_WALL_HEIGHT = 0.62
/** Glass toward the camera on the active floor drops to a low sill so the plan reads through it. */
export const SILL_HEIGHT = 0.3
/** Floor-to-ceiling glass: from the slab to the underside of the slab above. */
export const GLASS_HEIGHT = FLOOR_HEIGHT - SLAB_THICKNESS
const GLASS_THICKNESS = 0.06
const MULLION = 0.07

/** Horizontal sun direction for side shading; tops are always fully lit. */
const SUN = new THREE.Vector3(0.45, 0, 0.75).normalize()

export interface FloorGeometryOptions {
  /** Façade sides that drop to a sill so the plan reads through them; none for a closed façade. */
  cutaway?: readonly Facing[]
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
  const { x, y, width, depth, door, facing } = room
  // North and south run along x; east and west along y.
  const run = (side: Facing, from: number, to: number, emit: (a: number, b: number) => void) => {
    const doorAt = facing === side ? (side === 'north' || side === 'south' ? door.x : door.y) : null
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
    const step = DOOR_STEP[room.facing]
    const sill = { x: room.door.x + 0.5 + step.x * 0.45, z: room.door.y + 0.5 + step.y * 0.45 }
    solid.box(sill.x - 0.3, base, sill.z - 0.3, sill.x + 0.3, base + 0.05, sill.z + 0.3, PALETTE.door)
  }

  for (const core of building.coresOn(floor)) {
    const top = base + FLOOR_HEIGHT - SLAB_THICKNESS
    const band = options.selectedCoreId === core.id ? PALETTE.select : PALETTE.coreBand
    solid.box(core.x + 0.06, base, core.y + 0.06, core.x + core.width - 0.06, top - 0.14, core.y + core.depth - 0.06, PALETTE.core)
    solid.box(core.x + 0.06, top - 0.14, core.y + 0.06, core.x + core.width - 0.06, top, core.y + core.depth - 0.06, band)
  }

  // Floor-to-ceiling glass on every plate edge that faces open air (the site edge, a setback or an
  // atrium), framed by mullions, with doorways where a storefront or the lobby opens outside.
  const open = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= depth || plate[y * width + x] !== 1
  const edge = (x: number, y: number, side: Facing) => {
    const step = DOOR_STEP[side]
    return !open(x, y) && open(x + step.x, y + step.y)
  }
  const cutaway = new Set(options.cutaway ?? [])
  const doorways = new Map<string, { kind: 'store' | 'lobby', hex: number }>()
  for (const room of building.roomsOn(floor)) {
    if (room.storefront) doorways.set(`${room.door.x},${room.door.y},${room.facing}`, { kind: 'store', hex: USES[room.use].color })
  }
  const entrance = floor === 0 ? building.entrance() : null
  if (entrance && edge(entrance.x, entrance.y, 'south')) doorways.set(`${entrance.x},${entrance.y},south`, { kind: 'lobby', hex: PALETTE.canopy })
  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of FACINGS) {
        if (!edge(x, y, side)) continue
        const cut = cutaway.has(side)
        const top = base + (cut ? SILL_HEIGHT : GLASS_HEIGHT)
        const panel = (a: number, b: number, y0: number, y1: number, n0: number, n1: number, hex: number, out = solid) => edgeBox(out, x, y, side, a, b, y0, y1, n0, n1, hex)
        // A mullion at the start of each pane, and one closing the end of a run.
        const along = side === 'north' || side === 'south' ? { x: 1, y: 0 } : { x: 0, y: 1 }
        panel(-MULLION / 2, MULLION / 2, base, top, -GLASS_THICKNESS - 0.01, 0.01, PALETTE.mullion)
        if (!edge(x + along.x, y + along.y, side)) panel(1 - MULLION / 2, 1 + MULLION / 2, base, top, -GLASS_THICKNESS - 0.01, 0.01, PALETTE.mullion)
        const doorway = doorways.get(`${x},${y},${side}`)
        if (!doorway) {
          panel(MULLION / 2, 1 - MULLION / 2, base, top, -GLASS_THICKNESS, 0, PALETTE.glass, glass)
          continue
        }
        // An open bay: a threshold in the doorway, a sign band over a storefront, a canopy over the lobby.
        panel(0.1, 0.9, base, base + 0.04, -0.45, 0.2, lighten(doorway.hex, 0.35))
        if (doorway.kind === 'store' && !cut) panel(MULLION / 2, 1 - MULLION / 2, base + GLASS_HEIGHT - 0.24, base + GLASS_HEIGHT - 0.04, -GLASS_THICKNESS, 0.08, doorway.hex)
        if (doorway.kind === 'lobby') panel(-0.25, 1.25, base + 0.84, base + 0.92, 0, 0.75, doorway.hex)
      }
    }
  }

  return { solid: solid.empty ? null : solid.build(), glass: glass.empty ? null : glass.build() }
}

/**
 * A box against one wall of tile (x, y): `a`–`b` runs along the wall (0–1 spans
 * the tile) and `n0`–`n1` is the offset along the wall's outward normal, so
 * negative is inside the building and positive is out on the lot.
 */
function edgeBox(out: GeometryBuilder, x: number, y: number, side: Facing, a: number, b: number, y0: number, y1: number, n0: number, n1: number, hex: number): void {
  if (side === 'north') out.box(x + a, y0, y - n1, x + b, y1, y - n0, hex)
  else if (side === 'south') out.box(x + a, y0, y + 1 + n0, x + b, y1, y + 1 + n1, hex)
  else if (side === 'west') out.box(x - n1, y0, y + a, x - n0, y1, y + b, hex)
  else out.box(x + 1 + n0, y0, y + a, x + 1 + n1, y1, y + b, hex)
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
