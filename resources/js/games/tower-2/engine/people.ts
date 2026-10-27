/**
 * A handful of visitors walking from the street to rooms and back, riding
 * cores between floors. Presentation-grade: no schedules, queues or money yet.
 * Trips are planned once against the building as it stood when they began.
 */
import type { BuildingAnalysis } from './analysis'
import type { Room } from './building'
import type { PlateTile } from './floorPlate'

export const WALK_TILES_PER_SECOND = 3.2
export const RIDE_FLOORS_PER_SECOND = 1.6
const DWELL_SECONDS = [3, 7] as const
const SPAWN_SECONDS = 0.7

export interface Point {
  x: number
  y: number
}

export type Leg =
  | { kind: 'walk', floor: number, points: Point[] }
  | { kind: 'ride', x: number, y: number, from: number, to: number }
  | { kind: 'dwell', floor: number, x: number, y: number, seconds: number }

export interface Visitor {
  id: number
  roomId: number
  legs: Leg[]
  leg: number
  /** Seconds spent in the current leg. */
  elapsed: number
  x: number
  y: number
  /** Continuous, so riders sit between floors. */
  floor: number
}

/** Tile centres along a path; a single-tile path stays put. */
function centres(path: readonly PlateTile[]): Point[] {
  return path.map(({ x, y }) => ({ x: x + 0.5, y: y + 0.5 }))
}

/** The core tile nearest `from` by walking, with its path; null when none is reachable. */
function walkToCore(analysis: BuildingAnalysis, floor: number, from: PlateTile, core: { x: number, y: number, width: number, depth: number }) {
  const paths = analysis.paths(floor)
  let best: { tile: PlateTile, path: PlateTile[] } | null = null
  for (let y = core.y; y < core.y + core.depth; y++) {
    for (let x = core.x; x < core.x + core.width; x++) {
      const path = paths.findPath(from, { x, y })
      if (path && (!best || path.length < best.path.length)) best = { tile: { x, y }, path }
    }
  }
  return best
}

/** Street → room → street, or null when the room has no route. Deterministic for a given building. */
export function planVisit(analysis: BuildingAnalysis, room: Room, dwellSeconds: number): Leg[] | null {
  const entrance = analysis.building.entrance()
  if (!entrance) return null
  const hops = analysis.route(room.floor, room.door)
  if (!hops) return null
  const street: Point = { x: entrance.x + 0.5, y: entrance.y + 2.5 }
  const outbound: Leg[] = []
  let at: PlateTile = entrance
  let floor = 0
  let first: Point[] = [street]
  for (const hop of hops) {
    const reach = walkToCore(analysis, floor, at, hop.core)
    if (!reach) return null
    outbound.push({ kind: 'walk', floor, points: [...first, ...centres(reach.path)] })
    outbound.push({ kind: 'ride', x: reach.tile.x + 0.5, y: reach.tile.y + 0.5, from: floor, to: hop.toFloor })
    first = []
    at = reach.tile
    floor = hop.toFloor
  }
  const toDoor = analysis.paths(floor).findPath(at, room.door)
  if (!toDoor) return null
  const inside: Point = { x: room.x + room.width / 2, y: room.y + room.depth / 2 }
  outbound.push({ kind: 'walk', floor, points: [...first, ...centres(toDoor), inside] })
  const back = [...outbound].reverse().map((leg): Leg => {
    if (leg.kind === 'walk') return { ...leg, points: [...leg.points].reverse() }
    if (leg.kind === 'ride') return { ...leg, from: leg.to, to: leg.from }
    return leg
  })
  return [...outbound, { kind: 'dwell', floor: room.floor, x: inside.x, y: inside.y, seconds: dwellSeconds }, ...back]
}

function legSeconds(leg: Leg): number {
  if (leg.kind === 'dwell') return leg.seconds
  if (leg.kind === 'ride') return Math.abs(leg.to - leg.from) / RIDE_FLOORS_PER_SECOND
  let length = 0
  for (let i = 1; i < leg.points.length; i++) length += Math.hypot(leg.points[i]!.x - leg.points[i - 1]!.x, leg.points[i]!.y - leg.points[i - 1]!.y)
  return length / WALK_TILES_PER_SECOND
}

/** Where a visitor stands `elapsed` seconds into a leg. */
export function positionOnLeg(leg: Leg, elapsed: number): { x: number, y: number, floor: number } {
  if (leg.kind === 'dwell') return { x: leg.x, y: leg.y, floor: leg.floor }
  if (leg.kind === 'ride') {
    const total = legSeconds(leg)
    const t = total > 0 ? Math.min(1, elapsed / total) : 1
    return { x: leg.x, y: leg.y, floor: leg.from + (leg.to - leg.from) * t }
  }
  let remaining = elapsed * WALK_TILES_PER_SECOND
  for (let i = 1; i < leg.points.length; i++) {
    const a = leg.points[i - 1]!
    const b = leg.points[i]!
    const step = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= step) {
      const t = step > 0 ? remaining / step : 1
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, floor: leg.floor }
    }
    remaining -= step
  }
  const last = leg.points[leg.points.length - 1]!
  return { x: last.x, y: last.y, floor: leg.floor }
}

/** Small seeded generator, so a given building always produces the same crowd. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export class Crowd {
  readonly visitors: Visitor[] = []
  private nextId = 1
  private spawnTimer = 0
  private readonly random: () => number

  constructor(seed = 1) {
    this.random = mulberry32(seed)
  }

  /** Room count sets the crowd: two visitors per room, at most 60. */
  static capacityFor(roomCount: number): number {
    return Math.min(60, roomCount * 2)
  }

  step(analysis: BuildingAnalysis, seconds: number): void {
    const dt = Math.min(seconds, 0.25)
    for (const visitor of this.visitors) this.advance(visitor, dt)
    for (let i = this.visitors.length - 1; i >= 0; i--) {
      if (this.visitors[i]!.leg >= this.visitors[i]!.legs.length) this.visitors.splice(i, 1)
    }
    this.spawnTimer -= dt
    const rooms = analysis.building.allRooms()
    if (this.spawnTimer <= 0 && this.visitors.length < Crowd.capacityFor(rooms.length) && rooms.length > 0) {
      this.spawnTimer = SPAWN_SECONDS
      const room = rooms[Math.floor(this.random() * rooms.length)]!
      const dwell = DWELL_SECONDS[0] + this.random() * (DWELL_SECONDS[1] - DWELL_SECONDS[0])
      const legs = planVisit(analysis, room, dwell)
      if (legs) {
        const start = positionOnLeg(legs[0]!, 0)
        this.visitors.push({ id: this.nextId++, roomId: room.id, legs, leg: 0, elapsed: 0, ...start })
      }
    }
  }

  clear(): void {
    this.visitors.length = 0
  }

  private advance(visitor: Visitor, dt: number): void {
    let time = dt
    while (visitor.leg < visitor.legs.length) {
      const leg = visitor.legs[visitor.leg]!
      const total = legSeconds(leg)
      if (visitor.elapsed + time < total) {
        visitor.elapsed += time
        Object.assign(visitor, positionOnLeg(leg, visitor.elapsed))
        return
      }
      time -= total - visitor.elapsed
      Object.assign(visitor, positionOnLeg(leg, total))
      visitor.leg++
      visitor.elapsed = 0
    }
  }
}
