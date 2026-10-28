/**
 * Derived, read-only views of a Building: walkable tiles, daylight, which
 * walkable areas the street reaches through cores, and each room's rating.
 * Results are cached per building revision, so callers can ask freely.
 */
import { type Building, type Core, DOOR_STEP, type Room } from './building'
import { FloorPaths, FloorTile } from './floorPaths'
import type { PlateTile } from './floorPlate'
import type { UseKind } from './uses'

/** Daylight is the walk to the nearest glass edge, capped here (1 tile = 3 m). */
export const DAYLIGHT_CAP = 6
/** Door-to-core steps beyond which an office's walk scores nothing. */
const WALK_SPAN = 20
/** Entrance-to-door steps beyond which ground-floor footfall scores nothing. */
const FOOTFALL_SPAN = 30

export interface RoomRating {
  /** Mean daylight across the room, 0 (dark) to 1 (every tile by a window). */
  light: number
  /** Steps from the door to the nearest core on this floor; Infinity if none is reachable. */
  walk: number
  reachable: boolean
  noisy: boolean
  footfall: number
  score: number
  stars: 0 | 1 | 2 | 3
  notes: string[]
}

/** A street-to-room transfer: walk on `floor` to `core`, then ride it to `toFloor`. */
export interface CoreHop {
  floor: number
  core: Core
  toFloor: number
}

interface FloorCache {
  paths: FloorPaths
  daylight: Uint8Array
  /** Walkable region per tile, -1 where blocked. */
  regions: Int32Array
}

/** Walking over the open ground-floor lot, from the street at the site's +y edge. */
interface StreetField {
  /** Steps from the street to each open lot tile; -1 where the lot is built on or walled in. */
  steps: Int16Array
  /** The next tile toward the street, -1 on the street row itself. */
  toward: Int32Array
}

interface GraphNode {
  floor: number
  region: number
  parent: string | null
  hop: CoreHop | null
}

const NOISY_USES: ReadonlySet<UseKind> = new Set(['shop', 'cafe'])

export function floorTiles(building: Building, floor: number): Uint8Array {
  const tiles = new Uint8Array(building.width * building.depth)
  const plate = building.plateMask(floor)
  const corridor = building.corridorMask(floor)
  for (let index = 0; index < tiles.length; index++) {
    if (corridor[index] === 1) tiles[index] = FloorTile.Corridor
  }
  for (const room of building.roomsOn(floor)) {
    for (let y = room.y; y < room.y + room.depth; y++) {
      for (let x = room.x; x < room.x + room.width; x++) tiles[y * building.width + x] = FloorTile.Wall
    }
    tiles[room.door.y * building.width + room.door.x] = FloorTile.Door
  }
  for (const core of building.coresOn(floor)) {
    for (let y = core.y; y < core.y + core.depth; y++) {
      for (let x = core.x; x < core.x + core.width; x++) tiles[y * building.width + x] = FloorTile.Core
    }
  }
  // Open plate stays Empty: people walk corridors, not through unbuilt floor.
  for (let index = 0; index < tiles.length; index++) if (plate[index] !== 1) tiles[index] = FloorTile.Empty
  return tiles
}

/** 0 off the plate; otherwise steps to the nearest tile without plate (an edge or atrium), capped. */
export function daylightField(plate: Uint8Array, width: number, depth: number): Uint8Array {
  const field = new Uint8Array(width * depth)
  const queue = new Int32Array(width * depth)
  let tail = 0
  for (let index = 0; index < field.length; index++) {
    if (plate[index] !== 1) continue
    const x = index % width
    const y = (index / width) | 0
    const open = x === 0 || y === 0 || x === width - 1 || y === depth - 1
      || plate[index - 1] !== 1 || plate[index + 1] !== 1 || plate[index - width] !== 1 || plate[index + width] !== 1
    if (open) {
      field[index] = 1
      queue[tail++] = index
    }
  }
  for (let head = 0; head < tail; head++) {
    const current = queue[head]!
    const x = current % width
    const next = Math.min(field[current]! + 1, DAYLIGHT_CAP)
    for (const neighbor of [current - width, x + 1 < width ? current + 1 : -1, current + width, x > 0 ? current - 1 : -1]) {
      if (neighbor < 0 || neighbor >= field.length || plate[neighbor] !== 1 || field[neighbor] !== 0) continue
      field[neighbor] = next
      queue[tail++] = neighbor
    }
  }
  return field
}

/** 1 for a tile beside glass, falling to 1/DAYLIGHT_CAP at the cap; 0 off the plate. */
export function lightLevel(daylight: number): number {
  return daylight === 0 ? 0 : (DAYLIGHT_CAP + 1 - daylight) / DAYLIGHT_CAP
}

export class BuildingAnalysis {
  private revision = -1
  private readonly floors = new Map<number, FloorCache>()
  private served: Map<number, Set<number>> | null = null
  private graph: Map<string, GraphNode> | null = null
  private hops: Map<string, CoreHop[] | null> = new Map()
  private street: StreetField | null = null

  constructor(readonly building: Building) {}

  paths(floor: number): FloorPaths {
    return this.floor(floor).paths
  }

  daylight(floor: number): Uint8Array {
    return this.floor(floor).daylight
  }

  /** Walkable region labels on each floor that connect to the street entrance. */
  servedRegions(floor: number): ReadonlySet<number> {
    return this.servedMap().get(floor) ?? new Set()
  }

  isServed(floor: number, tile: PlateTile): boolean {
    const region = this.regionAt(floor, tile)
    return region >= 0 && this.servedRegions(floor).has(region)
  }

  /** Steps from each walkable tile to the nearest core on its floor; -1 where there is none. */
  walkField(floor: number): Int16Array {
    const paths = this.paths(floor)
    const field = new Int16Array(this.building.width * this.building.depth).fill(-1)
    for (let index = 0; index < field.length; index++) {
      const distance = paths.distanceToNearestCore({ door: { x: index % this.building.width, y: (index / this.building.width) | 0 } })
      if (Number.isFinite(distance)) field[index] = Math.min(distance, 0x7fff)
    }
    return field
  }

  /**
   * The cores to ride from the street to `floor`/`tile`, fewest transfers first
   * (then the lowest floors and earliest placed cores). Null when there is no route.
   */
  route(floor: number, tile: PlateTile): CoreHop[] | null {
    this.sync()
    const key = `${floor}:${this.regionAt(floor, tile)}`
    if (!this.hops.has(key)) this.hops.set(key, this.searchRoute(floor, this.regionAt(floor, tile)))
    return this.hops.get(key) ?? null
  }

  /**
   * A storefront's approach: open-lot tiles from the street row to the tile
   * outside its door, street end first. Empty when the door opens straight
   * onto the street; null when the lot around the door is walled in.
   */
  storefrontApproach(room: Room): PlateTile[] | null {
    const step = DOOR_STEP[room.facing]
    const outside = { x: room.door.x + step.x, y: room.door.y + step.y }
    if (!this.building.inBounds(outside.x, outside.y)) return outside.y === this.building.depth ? [] : null
    const { steps, toward } = this.streetField()
    let index = outside.y * this.building.width + outside.x
    if (steps[index]! < 0) return null
    const path: PlateTile[] = []
    while (index >= 0) {
      path.push({ x: index % this.building.width, y: (index / this.building.width) | 0 })
      index = toward[index]!
    }
    return path.reverse()
  }

  rate(room: Room): RoomRating {
    const daylight = this.daylight(room.floor)
    let light = 0
    for (let y = room.y; y < room.y + room.depth; y++) {
      for (let x = room.x; x < room.x + room.width; x++) light += lightLevel(daylight[y * this.building.width + x]!)
    }
    light /= room.width * room.depth
    const paths = this.paths(room.floor)
    const walk = paths.distanceToNearestCore(room)
    const approach = room.storefront ? this.storefrontApproach(room) : null
    const reachable = room.storefront ? approach !== null : this.isServed(room.floor, room.door)
    const noisy = room.use === 'studio' && this.hasNoisyNeighbour(room)
    const entrance = this.building.entrance()
    // A storefront trades with passers-by: footfall falls with the walk in from the street.
    const footfall = approach ? clamp01(1 - approach.length / FOOTFALL_SPAN)
      : room.floor === 0 && entrance && reachable ? clamp01(1 - paths.distance(entrance, room.door) / FOOTFALL_SPAN)
        : 0
    const walkScore = Number.isFinite(walk) ? clamp01(1 - (walk - 1) / WALK_SPAN) : 0
    const raw = {
      studio: 0.6 * light + 0.4 * (noisy ? 0 : 1),
      office: 0.5 * light + 0.5 * walkScore,
      shop: room.floor === 0 ? 0.4 + 0.6 * footfall : 0.25 * walkScore,
      cafe: 0.5 * light + 0.5 * (room.floor === 0 ? footfall : 0.4 * walkScore),
    }[room.use]
    const score = reachable ? Math.round(raw * 100) / 100 : 0
    const notes: string[] = []
    if (!reachable) notes.push('No route from the street')
    if (room.floor < 0) notes.push('Underground: no daylight')
    else if (light < 0.4) notes.push('Dark: too far from a window')
    if (Number.isFinite(walk) && walk > 12) notes.push('Long walk to a core')
    if (noisy) notes.push('Noisy shop or café next door or below')
    if ((room.use === 'shop' || room.use === 'cafe') && room.floor !== 0) notes.push('Wants the street floor')
    return { light, walk, reachable, noisy, footfall, score, stars: starsFor(score), notes }
  }

  private floor(floor: number): FloorCache {
    this.sync()
    let cache = this.floors.get(floor)
    if (!cache) {
      const { width, depth } = this.building
      const paths = new FloorPaths({ width, depth, tiles: floorTiles(this.building, floor) })
      // Basements are underground: no glass, so no daylight anywhere.
      const daylight = floor < 0 ? new Uint8Array(width * depth) : daylightField(this.building.plateMask(floor), width, depth)
      cache = { paths, daylight, regions: paths.connectedRegions().labels }
      this.floors.set(floor, cache)
    }
    return cache
  }

  private sync(): void {
    if (this.revision === this.building.revision) return
    this.revision = this.building.revision
    this.floors.clear()
    this.served = null
    this.graph = null
    this.hops = new Map()
    this.street = null
  }

  private streetField(): StreetField {
    this.sync()
    if (this.street) return this.street
    const { width, depth } = this.building
    const plate = this.building.plateMask(0)
    const steps = new Int16Array(width * depth).fill(-1)
    const toward = new Int32Array(width * depth).fill(-1)
    const queue = new Int32Array(width * depth)
    let tail = 0
    for (let x = 0; x < width; x++) {
      const index = (depth - 1) * width + x
      if (plate[index] === 1) continue
      steps[index] = 1
      queue[tail++] = index
    }
    for (let head = 0; head < tail; head++) {
      const current = queue[head]!
      const x = current % width
      for (const next of [current - width, x + 1 < width ? current + 1 : -1, current + width, x > 0 ? current - 1 : -1]) {
        if (next < 0 || next >= steps.length || plate[next] === 1 || steps[next]! >= 0) continue
        steps[next] = steps[current]! + 1
        toward[next] = current
        queue[tail++] = next
      }
    }
    this.street = { steps, toward }
    return this.street
  }

  private regionAt(floor: number, tile: PlateTile): number {
    if (!this.building.inBounds(tile.x, tile.y) || !this.building.isFloor(floor)) return -1
    return this.floor(floor).regions[tile.y * this.building.width + tile.x]!
  }

  /** Breadth-first over (floor, region) nodes; cores join the regions they stand in on each floor. */
  private searchGraph(): Map<string, GraphNode> {
    this.sync()
    if (this.graph) return this.graph
    const visited = new Map<string, GraphNode>()
    this.graph = visited
    const entrance = this.building.entrance()
    if (!entrance) return visited
    const start = this.regionAt(0, entrance)
    if (start < 0) return visited
    const queue = [`0:${start}`]
    visited.set(queue[0]!, { floor: 0, region: start, parent: null, hop: null })
    const cores = this.building.cores()
    for (let head = 0; head < queue.length; head++) {
      const key = queue[head]!
      const node = visited.get(key)!
      for (const core of cores) {
        if (node.floor < core.bottomFloor || node.floor > core.topFloor) continue
        if (this.regionAt(node.floor, core) !== node.region) continue
        for (let floor = core.bottomFloor; floor <= core.topFloor; floor++) {
          const region = this.regionAt(floor, core)
          const next = `${floor}:${region}`
          if (region < 0 || visited.has(next)) continue
          visited.set(next, { floor, region, parent: key, hop: { floor: node.floor, core, toFloor: floor } })
          queue.push(next)
        }
      }
    }
    return visited
  }

  private servedMap(): Map<number, Set<number>> {
    this.sync()
    if (!this.served) {
      this.served = new Map()
      for (const { floor, region } of this.searchGraph().values()) {
        const set = this.served.get(floor) ?? new Set<number>()
        set.add(region)
        this.served.set(floor, set)
      }
    }
    return this.served
  }

  private searchRoute(floor: number, region: number): CoreHop[] | null {
    if (region < 0) return null
    const graph = this.searchGraph()
    let key: string | null = `${floor}:${region}`
    if (!graph.has(key)) return null
    const hops: CoreHop[] = []
    while (key) {
      const node: GraphNode = graph.get(key)!
      if (node.hop) hops.push(node.hop)
      key = node.parent
    }
    return hops.reverse()
  }

  private hasNoisyNeighbour(room: Room): boolean {
    const touches = (other: Room) => other.x <= room.x + room.width && room.x <= other.x + other.width
      && other.y <= room.y + room.depth && room.y <= other.y + other.depth
    const overlaps = (other: Room) => other.x < room.x + room.width && room.x < other.x + other.width
      && other.y < room.y + room.depth && room.y < other.y + other.depth
    return this.building.allRooms().some((other) => other.id !== room.id && NOISY_USES.has(other.use)
      && ((other.floor === room.floor && touches(other)) || (other.floor === room.floor - 1 && overlaps(other))))
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function starsFor(score: number): 0 | 1 | 2 | 3 {
  return score >= 0.8 ? 3 : score >= 0.55 ? 2 : score >= 0.3 ? 1 : 0
}
