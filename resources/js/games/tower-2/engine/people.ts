/**
 * A handful of visitors walking from the street to rooms and back, riding
 * elevator cars between floors. Cars queue riders, travel at a fixed speed and
 * hold their doors; there are no schedules or money yet. Trips are planned once
 * against the building as it stood when they began.
 */
import type { BuildingAnalysis } from './analysis'
import type { Building, Core, Room } from './building'
import type { PlateTile } from './floorPlate'
import { carsIn } from './uses'

export const WALK_TILES_PER_SECOND = 3.2
export const RIDE_FLOORS_PER_SECOND = 1.6
/** Riders a car carries at once. */
export const CAR_CAPACITY = 6
/** How long a car's doors stay open at a stop. */
export const DOOR_SECONDS = 1.2
/** How many recent boardings the average wait covers. */
const WAIT_SAMPLES = 24
const DWELL_SECONDS = [3, 7] as const
const SPAWN_SECONDS = 0.7

export interface Point {
  x: number
  y: number
}

export type Leg =
  | { kind: 'walk', floor: number, points: Point[] }
  /** Wait in the hall at (x, y) for a car of `coreId`, ride it from `from` to `to`, and step out at (x, y). */
  | { kind: 'ride', coreId: string, car: number, x: number, y: number, from: number, to: number }
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
  /** On a ride leg: waiting in the hall since `since`, or riding a car. */
  ride?: { state: 'waiting', since: number } | { state: 'riding' }
}

/** One elevator car; its shaft is the core's back-row tile in column `index`. */
export interface Car {
  coreId: string
  index: number
  x: number
  y: number
  /** Continuous floor position. */
  floor: number
  /** Seconds the doors stay open; the car waits while it is above zero. */
  doors: number
  riders: Visitor[]
}

/** A core's hall tile in front of car `index`, where riders wait and step out. */
export function hallTile(core: Pick<Core, 'x' | 'y'>, index: number): PlateTile {
  return { x: core.x + index, y: core.y + 1 }
}

/** Tile centres along a path; a single-tile path stays put. */
function centres(path: readonly PlateTile[]): Point[] {
  return path.map(({ x, y }) => ({ x: x + 0.5, y: y + 0.5 }))
}

/** The hall tile nearest `from` by walking, its car and path; null when none is reachable. */
function walkToCore(analysis: BuildingAnalysis, floor: number, from: PlateTile, core: Core) {
  const paths = analysis.paths(floor)
  let best: { tile: PlateTile, car: number, path: PlateTile[] } | null = null
  for (let car = 0; car < carsIn(core); car++) {
    const tile = hallTile(core, car)
    const path = paths.findPath(from, tile)
    if (path && (!best || path.length < best.path.length)) best = { tile, car, path }
  }
  return best
}

/** Out and back again: the return trip retraces the outbound legs. */
function roundTrip(outbound: Leg[], room: Room, inside: Point, dwellSeconds: number): Leg[] {
  const back = [...outbound].reverse().map((leg): Leg => {
    if (leg.kind === 'walk') return { ...leg, points: [...leg.points].reverse() }
    if (leg.kind === 'ride') return { ...leg, from: leg.to, to: leg.from }
    return leg
  })
  return [...outbound, { kind: 'dwell', floor: room.floor, x: inside.x, y: inside.y, seconds: dwellSeconds }, ...back]
}

/** Street → room → street, or null when the room has no route. Deterministic for a given building. */
export function planVisit(analysis: BuildingAnalysis, room: Room, dwellSeconds: number): Leg[] | null {
  const inside: Point = { x: room.x + room.width / 2, y: room.y + room.depth / 2 }
  if (room.storefront) {
    // Straight in off the pavement, across the open lot.
    const approach = analysis.storefrontApproach(room)
    if (!approach) return null
    const first = approach[0] ?? room.door
    const pavement: Point = { x: first.x + 0.5, y: analysis.building.depth + 1.5 }
    return roundTrip([{ kind: 'walk', floor: 0, points: [pavement, ...centres(approach), ...centres([room.door]), inside] }], room, inside, dwellSeconds)
  }
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
    outbound.push({ kind: 'ride', coreId: hop.core.id, car: reach.car, x: reach.tile.x + 0.5, y: reach.tile.y + 0.5, from: floor, to: hop.toFloor })
    first = []
    at = reach.tile
    floor = hop.toFloor
  }
  const toDoor = analysis.paths(floor).findPath(at, room.door)
  if (!toDoor) return null
  outbound.push({ kind: 'walk', floor, points: [...first, ...centres(toDoor), inside] })
  return roundTrip(outbound, room, inside, dwellSeconds)
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
  private readonly carsByCore = new Map<string, Car[]>()
  private readonly waits = new Map<string, number[]>()
  private nextId = 1
  private spawnTimer = 0
  private clock = 0
  private readonly random: () => number

  constructor(seed = 1) {
    this.random = mulberry32(seed)
  }

  /** Room count sets the crowd: two visitors per room, at most 60. */
  static capacityFor(roomCount: number): number {
    return Math.min(60, roomCount * 2)
  }

  /** Every car, for drawing. */
  cars(): Car[] {
    return [...this.carsByCore.values()].flat()
  }

  /** A core's mean wait from reaching the hall to boarding, over its recent riders; null before anyone has boarded. */
  averageWait(coreId: string): number | null {
    const samples = this.waits.get(coreId)
    return samples && samples.length > 0 ? samples.reduce((sum, wait) => sum + wait, 0) / samples.length : null
  }

  /** Visitors waiting in a core's halls right now. */
  waiting(coreId: string): number {
    return this.visitors.filter((visitor) => visitor.ride?.state === 'waiting' && this.rideLeg(visitor)?.coreId === coreId).length
  }

  step(analysis: BuildingAnalysis, seconds: number): void {
    const dt = Math.min(seconds, 0.25)
    this.clock += dt
    this.syncCars(analysis.building)
    for (const visitor of this.visitors) this.advance(visitor, dt)
    this.stepCars(dt)
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
    this.carsByCore.clear()
    this.waits.clear()
  }

  private rideLeg(visitor: Visitor): Extract<Leg, { kind: 'ride' }> | null {
    const leg = visitor.legs[visitor.leg]
    return leg?.kind === 'ride' ? leg : null
  }

  /**
   * Keep one car per shaft for every core. A core that is gone or reshaped
   * drops its cars, and the visitors waiting for or riding them leave.
   */
  private syncCars(building: Building): void {
    const cores = new Map(building.cores().map((core) => [core.id, core]))
    for (const [id, cars] of this.carsByCore) {
      const core = cores.get(id)
      if (core && carsIn(core) === cars.length && core.x === cars[0]!.x - 0.5 && core.y === cars[0]!.y - 0.5) continue
      this.carsByCore.delete(id)
      for (const visitor of this.visitors) if (this.rideLeg(visitor)?.coreId === id) visitor.leg = visitor.legs.length
    }
    for (const core of cores.values()) {
      if (this.carsByCore.has(core.id)) continue
      this.carsByCore.set(core.id, Array.from({ length: carsIn(core) }, (_, index) => ({
        coreId: core.id, index, x: core.x + index + 0.5, y: core.y + 0.5, floor: core.bottomFloor, doors: 0, riders: [],
      })))
    }
  }

  private advance(visitor: Visitor, dt: number): void {
    let time = dt
    while (visitor.leg < visitor.legs.length) {
      const leg = visitor.legs[visitor.leg]!
      if (leg.kind === 'ride') {
        // Cars move riders; a visitor reaching a ride leg waits in the hall for one.
        if (!visitor.ride) {
          visitor.ride = { state: 'waiting', since: this.clock }
          Object.assign(visitor, { x: leg.x, y: leg.y, floor: leg.from })
        }
        return
      }
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

  /**
   * Collective control, simplified: each floor with waiting riders goes to the
   * nearest car with room, and a car heads for its nearest stop, carrying on in
   * its direction while it has stops ahead. At a stop the doors open, riders for
   * that floor step out and waiting riders step in.
   */
  private stepCars(dt: number): void {
    for (const [coreId, cars] of this.carsByCore) {
      const waiting = this.visitors.filter((visitor) => visitor.ride?.state === 'waiting' && this.rideLeg(visitor)?.coreId === coreId)
      const calls = new Map<number, Car>()
      for (const floor of [...new Set(waiting.map((visitor) => this.rideLeg(visitor)!.from))].sort((a, b) => a - b)) {
        let best: Car | null = null
        for (const car of cars) {
          if (car.riders.length >= CAR_CAPACITY) continue
          if (!best || Math.abs(car.floor - floor) < Math.abs(best.floor - floor)) best = car
        }
        if (best) calls.set(floor, best)
      }
      for (const car of cars) {
        if (car.doors > 0) {
          car.doors = Math.max(0, car.doors - dt)
          continue
        }
        const stops = [...new Set([
          ...car.riders.map((rider) => this.rideLeg(rider)!.to),
          ...[...calls].filter(([, assigned]) => assigned === car).map(([floor]) => floor),
        ])]
        if (stops.length === 0) continue
        const target = stops.reduce((nearest, stop) => (Math.abs(stop - car.floor) < Math.abs(nearest - car.floor) ? stop : nearest))
        const step = RIDE_FLOORS_PER_SECOND * dt
        if (Math.abs(target - car.floor) > step) {
          car.floor += Math.sign(target - car.floor) * step
        } else {
          car.floor = target
          this.stop(car, waiting)
        }
        for (const rider of car.riders) rider.floor = car.floor
      }
    }
  }

  private stop(car: Car, waiting: Visitor[]): void {
    const floor = car.floor
    for (const rider of [...car.riders]) {
      const leg = this.rideLeg(rider)!
      if (leg.to !== floor) continue
      car.riders.splice(car.riders.indexOf(rider), 1)
      Object.assign(rider, { x: leg.x, y: leg.y, floor })
      delete rider.ride
      rider.leg++
      rider.elapsed = 0
    }
    for (const visitor of waiting) {
      if (car.riders.length >= CAR_CAPACITY) break
      if (visitor.ride?.state !== 'waiting' || this.rideLeg(visitor)!.from !== floor) continue
      const samples = this.waits.get(car.coreId) ?? []
      samples.push(this.clock - visitor.ride.since)
      if (samples.length > WAIT_SAMPLES) samples.shift()
      this.waits.set(car.coreId, samples)
      visitor.ride = { state: 'riding' }
      Object.assign(visitor, { x: car.x, y: car.y })
      car.riders.push(visitor)
    }
    car.doors = DOOR_SECONDS
  }
}
