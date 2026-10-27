/**
 * The prototype's editable building: floor plates and cores (FloorPlateModel),
 * plus drawn corridors and fixed-size rooms. Every edit validates before it
 * changes anything and reports a player-facing reason when it refuses.
 */
import { FloorPlateModel, type FloorPlateSnapshot, type PlateTile, type VerticalFootprint } from './floorPlate'
import { CORE_SIZE, type UseKind, USES } from './uses'

export const SITE_WIDTH = 40
export const SITE_DEPTH = 40
/** Floors 0 (street) to FLOOR_COUNT - 1. */
export const FLOOR_COUNT = 6

export interface Room {
  id: number
  use: UseKind
  floor: number
  x: number
  y: number
  width: number
  depth: number
  rotated: boolean
  /** A perimeter tile of the room that opens onto a corridor or core. */
  door: PlateTile
  /** The wall the door is in: the outward step from the door tile. */
  doorSide: DoorSide
}

export type DoorSide = 'south' | 'east' | 'north' | 'west'

export const DOOR_STEP: Readonly<Record<DoorSide, PlateTile>> = {
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  north: { x: 0, y: -1 },
  west: { x: -1, y: 0 },
}

export type Core = VerticalFootprint

export type EditResult = { ok: true } | { ok: false, reason: string }

export type TileUse = 'empty' | 'plate' | 'corridor' | 'room' | 'core'

export interface RoomCheck {
  ok: boolean
  reason?: string | undefined
  door?: { tile: PlateTile, side: DoorSide } | undefined
  width: number
  depth: number
}

export interface CoreCheck {
  ok: boolean
  reason?: string | undefined
  bottomFloor: number
  topFloor: number
}

export interface BuildingSnapshot {
  version: 1
  plates: FloorPlateSnapshot
  corridors: { floor: number, tiles: number[] }[]
  rooms: Room[]
  nextRoomId: number
  nextCoreId: number
}

const OK: EditResult = { ok: true }

function refuse(reason: string): EditResult {
  return { ok: false, reason }
}

export class Building {
  readonly width = SITE_WIDTH
  readonly depth = SITE_DEPTH
  readonly floorCount = FLOOR_COUNT
  /** Bumps on every successful edit; scene layers and analysis caches key on it. */
  revision = 0
  private plates = new FloorPlateModel({ width: SITE_WIDTH, depth: SITE_DEPTH })
  private readonly corridors = new Map<number, Uint8Array>()
  private rooms: Room[] = []
  private nextRoomId = 1
  private nextCoreId = 1
  private roomGridRevision = -1
  private readonly roomGrids = new Map<number, Int32Array>()

  // ── Queries ───────────────────────────────────────────────────────────────

  isFloor(floor: number): boolean {
    return Number.isSafeInteger(floor) && floor >= 0 && floor < this.floorCount
  }

  inBounds(x: number, y: number): boolean {
    return Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.depth
  }

  plateMask(floor: number): Uint8Array {
    return this.plates.getPlate(floor)
  }

  corridorMask(floor: number): Uint8Array {
    return this.corridors.get(floor)?.slice() ?? new Uint8Array(this.width * this.depth)
  }

  hasPlate(floor: number, x: number, y: number): boolean {
    return this.inBounds(x, y) && this.plates.hasPlate(floor, { x, y })
  }

  overhangCount(floor: number): number {
    return floor > 0 ? this.plates.overhangCount(floor) : 0
  }

  plateArea(floor: number): number {
    return this.plates.getPlate(floor).reduce((sum, tile) => sum + tile, 0)
  }

  allRooms(): readonly Room[] {
    return this.rooms
  }

  roomsOn(floor: number): Room[] {
    return this.rooms.filter((room) => room.floor === floor)
  }

  room(id: number): Room | undefined {
    return this.rooms.find((room) => room.id === id)
  }

  cores(): Core[] {
    return this.plates.verticalFootprints().filter((footprint) => footprint.kind === 'core')
  }

  coresOn(floor: number): Core[] {
    return this.plates.verticalFootprintsAt(floor).filter((footprint) => footprint.kind === 'core')
  }

  core(id: string): Core | undefined {
    return this.cores().find((core) => core.id === id)
  }

  roomAt(floor: number, x: number, y: number): Room | undefined {
    if (!this.inBounds(x, y) || !this.isFloor(floor)) return undefined
    const id = this.roomGrid(floor)[y * this.width + x]!
    return id > 0 ? this.room(id) : undefined
  }

  coreAt(floor: number, x: number, y: number): Core | undefined {
    return this.coresOn(floor).find((core) => x >= core.x && x < core.x + core.width && y >= core.y && y < core.y + core.depth)
  }

  tileUse(floor: number, x: number, y: number): TileUse {
    if (!this.hasPlate(floor, x, y)) return 'empty'
    if (this.coreAt(floor, x, y)) return 'core'
    if (this.roomAt(floor, x, y)) return 'room'
    return this.corridors.get(floor)?.[y * this.width + x] === 1 ? 'corridor' : 'plate'
  }

  /** The street entrance: the ground-floor corridor tile nearest the street (+y), then leftmost. */
  entrance(): PlateTile | null {
    const corridor = this.corridors.get(0)
    if (!corridor) return null
    for (let y = this.depth - 1; y >= 0; y--) {
      for (let x = 0; x < this.width; x++) {
        if (corridor[y * this.width + x] === 1) return { x, y }
      }
    }
    return null
  }

  // ── Plates ────────────────────────────────────────────────────────────────

  paintPlate(floor: number, tiles: readonly PlateTile[]): EditResult {
    if (!this.isFloor(floor)) return refuse('That floor is outside the site')
    const inside = tiles.filter(({ x, y }) => this.inBounds(x, y))
    if (inside.length === 0) return refuse('Paint inside the site')
    this.plates.paint(floor, inside)
    return this.changed()
  }

  /** Bulldoze: rooms touching the selection and corridors in it go with the plate. Cores stay. */
  erase(floor: number, tiles: readonly PlateTile[]): EditResult {
    if (!this.isFloor(floor)) return refuse('That floor is outside the site')
    const inside = tiles.filter(({ x, y }) => this.inBounds(x, y))
    if (inside.some(({ x, y }) => this.coreAt(floor, x, y))) return refuse('A core stands here. Select it to shorten or remove it first.')
    if (!inside.some(({ x, y }) => this.hasPlate(floor, x, y))) return refuse('Nothing to clear here')
    this.clearContents(floor, inside)
    this.plates.erase(floor, inside)
    return this.changed()
  }

  /** Cut the same hole from this floor to the top of the site. */
  carveAtrium(floor: number, tiles: readonly PlateTile[]): EditResult {
    if (!this.isFloor(floor)) return refuse('That floor is outside the site')
    const inside = tiles.filter(({ x, y }) => this.inBounds(x, y))
    for (let level = floor; level < this.floorCount; level++) {
      if (inside.some(({ x, y }) => this.coreAt(level, x, y))) return refuse(`A core on floor ${level} is in the way`)
    }
    if (!inside.some(({ x, y }) => this.hasPlate(floor, x, y))) return refuse('An atrium needs floor plate to cut')
    for (let level = floor; level < this.floorCount; level++) this.clearContents(level, inside)
    this.plates.carveAtrium(floor, this.floorCount - 1, inside)
    return this.changed()
  }

  inheritFloorBelow(floor: number): EditResult {
    if (!this.isFloor(floor) || floor === 0) return refuse('The street floor has nothing below to copy')
    if (this.plateArea(floor - 1) === 0) return refuse(`Floor ${floor - 1} has no plate to copy`)
    const below = this.plates.getPlate(floor - 1)
    const lost: PlateTile[] = []
    const current = this.plates.getPlate(floor)
    for (let index = 0; index < current.length; index++) {
      if (current[index] === 1 && below[index] !== 1) lost.push({ x: index % this.width, y: Math.floor(index / this.width) })
    }
    if (lost.some(({ x, y }) => this.coreAt(floor, x, y))) return refuse('A core here sits outside the floor below')
    this.clearContents(floor, lost)
    this.plates.inheritFloorBelow(floor)
    return this.changed()
  }

  // ── Corridors ─────────────────────────────────────────────────────────────

  paintCorridor(floor: number, tiles: readonly PlateTile[]): EditResult {
    if (!this.isFloor(floor)) return refuse('That floor is outside the site')
    const usable = tiles.filter(({ x, y }) => this.tileUse(floor, x, y) === 'plate')
    if (usable.length === 0) return refuse('Corridors go on open floor plate')
    const mask = this.corridors.get(floor) ?? new Uint8Array(this.width * this.depth)
    for (const { x, y } of usable) mask[y * this.width + x] = 1
    this.corridors.set(floor, mask)
    return this.changed()
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  checkRoom(use: UseKind, floor: number, x: number, y: number, rotated: boolean): RoomCheck {
    const def = USES[use]
    const width = rotated ? def.depth : def.width
    const depth = rotated ? def.width : def.depth
    const result = (reason?: string, door?: RoomCheck['door']): RoomCheck => ({ ok: !reason, reason, door, width, depth })
    if (!this.isFloor(floor)) return result('That floor is outside the site')
    for (let ty = y; ty < y + depth; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        const use = this.inBounds(tx, ty) ? this.tileUse(floor, tx, ty) : 'empty'
        if (use === 'empty') return result('Rooms need floor plate under every tile')
        if (use !== 'plate') return result(`Overlaps a ${use}`)
      }
    }
    const door = this.doorFor(floor, x, y, width, depth)
    return door ? result(undefined, door) : result('A room needs a corridor or core along one side')
  }

  placeRoom(use: UseKind, floor: number, x: number, y: number, rotated = false): EditResult {
    const check = this.checkRoom(use, floor, x, y, rotated)
    if (!check.ok || !check.door) return refuse(check.reason ?? 'Cannot place that room')
    this.rooms.push({ id: this.nextRoomId++, use, floor, x, y, width: check.width, depth: check.depth, rotated, door: check.door.tile, doorSide: check.door.side })
    return this.changed()
  }

  removeRoom(id: number): EditResult {
    const before = this.rooms.length
    this.rooms = this.rooms.filter((room) => room.id !== id)
    return before === this.rooms.length ? refuse('That room is already gone') : this.changed()
  }

  // ── Cores ─────────────────────────────────────────────────────────────────

  /** A new core stretches over the contiguous floors around this one where its footprint is free. */
  checkCore(floor: number, x: number, y: number): CoreCheck {
    const fail = (reason: string): CoreCheck => ({ ok: false, reason, bottomFloor: floor, topFloor: floor })
    if (!this.isFloor(floor)) return fail('That floor is outside the site')
    if (!this.inBounds(x, y) || !this.inBounds(x + CORE_SIZE - 1, y + CORE_SIZE - 1)) return fail('Cores go inside the site')
    const reason = this.coreFloorProblem(floor, x, y)
    if (reason) return fail(reason)
    let bottomFloor = floor
    let topFloor = floor
    while (bottomFloor > 0 && !this.coreFloorProblem(bottomFloor - 1, x, y)) bottomFloor--
    while (topFloor < this.floorCount - 1 && !this.coreFloorProblem(topFloor + 1, x, y)) topFloor++
    return { ok: true, bottomFloor, topFloor }
  }

  placeCore(floor: number, x: number, y: number): EditResult {
    const check = this.checkCore(floor, x, y)
    if (!check.ok) return refuse(check.reason ?? 'Cannot place a core here')
    this.plates.placeVerticalFootprint({
      id: `core-${this.nextCoreId++}`, kind: 'core', x, y, width: CORE_SIZE, depth: CORE_SIZE,
      bottomFloor: check.bottomFloor, topFloor: check.topFloor,
    })
    return this.changed()
  }

  /** Stretch or shorten a core; every floor in the new range must have free plate under it. */
  resizeCore(id: string, bottomFloor: number, topFloor: number): EditResult {
    const core = this.core(id)
    if (!core) return refuse('That core is already gone')
    if (!this.isFloor(bottomFloor) || !this.isFloor(topFloor) || bottomFloor > topFloor) return refuse('A core spans at least one floor of the site')
    for (let floor = bottomFloor; floor <= topFloor; floor++) {
      if (floor >= core.bottomFloor && floor <= core.topFloor) continue
      const reason = this.coreFloorProblem(floor, core.x, core.y)
      if (reason) return refuse(`Floor ${floor}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`)
    }
    this.plates.resizeVerticalFootprint(id, bottomFloor, topFloor)
    // Rooms whose only door opened onto the removed core floors lose access, not their place.
    return this.changed()
  }

  removeCore(id: string): EditResult {
    return this.plates.removeVerticalFootprint(id) ? this.changed() : refuse('That core is already gone')
  }

  // ── Saves ─────────────────────────────────────────────────────────────────

  snapshot(): BuildingSnapshot {
    const corridors = [...this.corridors.entries()].sort(([a], [b]) => a - b).map(([floor, mask]) => {
      const tiles: number[] = []
      for (let index = 0; index < mask.length; index++) if (mask[index] === 1) tiles.push(index)
      return { floor, tiles }
    }).filter(({ tiles }) => tiles.length > 0)
    return {
      version: 1,
      plates: this.plates.snapshot(),
      corridors,
      rooms: this.rooms.map((room) => ({ ...room, door: { ...room.door } })),
      nextRoomId: this.nextRoomId,
      nextCoreId: this.nextCoreId,
    }
  }

  /** Replays a snapshot through the edit rules; throws when any part no longer validates. */
  static fromSnapshot(snapshot: BuildingSnapshot): Building {
    if (snapshot?.version !== 1) throw new RangeError('Unknown building save version')
    const building = new Building()
    const plates = FloorPlateModel.fromSnapshot(snapshot.plates)
    if (plates.width !== building.width || plates.depth !== building.depth) throw new RangeError('Saved site has a different size')
    building.plates = plates
    for (const { floor, tiles } of snapshot.corridors) {
      const result = building.paintCorridor(floor, tiles.map((index) => ({ x: index % building.width, y: Math.floor(index / building.width) })))
      if (!result.ok) throw new RangeError(result.reason)
    }
    for (const room of snapshot.rooms) {
      building.nextRoomId = room.id
      const result = building.placeRoom(room.use, room.floor, room.x, room.y, room.rotated)
      if (!result.ok) throw new RangeError(result.reason)
    }
    building.nextRoomId = Math.max(snapshot.nextRoomId, ...building.rooms.map((room) => room.id + 1), 1)
    building.nextCoreId = Math.max(snapshot.nextCoreId, 1)
    building.revision = 0
    return building
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private changed(): EditResult {
    this.revision++
    return OK
  }

  private roomGrid(floor: number): Int32Array {
    if (this.roomGridRevision !== this.revision) {
      this.roomGrids.clear()
      this.roomGridRevision = this.revision
    }
    let grid = this.roomGrids.get(floor)
    if (!grid) {
      grid = new Int32Array(this.width * this.depth)
      for (const room of this.rooms) {
        if (room.floor !== floor) continue
        for (let y = room.y; y < room.y + room.depth; y++) {
          for (let x = room.x; x < room.x + room.width; x++) grid[y * this.width + x] = room.id
        }
      }
      this.roomGrids.set(floor, grid)
    }
    return grid
  }

  /** Remove corridors on these tiles and every room that touches one of them. */
  private clearContents(floor: number, tiles: readonly PlateTile[]): void {
    const corridor = this.corridors.get(floor)
    const doomed = new Set<number>()
    for (const { x, y } of tiles) {
      if (corridor) corridor[y * this.width + x] = 0
      const room = this.roomAt(floor, x, y)
      if (room) doomed.add(room.id)
    }
    if (doomed.size > 0) this.rooms = this.rooms.filter((room) => !doomed.has(room.id))
    // Room ids are cached per revision; the caller's changed() invalidates them.
    this.roomGridRevision = -1
  }

  private coreFloorProblem(floor: number, x: number, y: number): string | null {
    for (let ty = y; ty < y + CORE_SIZE; ty++) {
      for (let tx = x; tx < x + CORE_SIZE; tx++) {
        const use = this.tileUse(floor, tx, ty)
        if (use === 'empty') return 'Cores need floor plate under every tile'
        if (use !== 'plate') return `Overlaps a ${use}`
      }
    }
    return null
  }

  /**
   * The perimeter tile nearest the middle of a side whose outside neighbour is
   * a corridor or core. Sides are tried street-first (+y), then east, north and
   * west, so the choice is deterministic.
   */
  private doorFor(floor: number, x: number, y: number, width: number, depth: number): { tile: PlateTile, side: DoorSide } | null {
    const opensOnto = (tx: number, ty: number) => {
      const use = this.inBounds(tx, ty) ? this.tileUse(floor, tx, ty) : 'empty'
      return use === 'corridor' || use === 'core'
    }
    const sides: { side: DoorSide, tiles: PlateTile[] }[] = [
      { side: 'south', tiles: Array.from({ length: width }, (_, i) => ({ x: x + i, y: y + depth - 1 })) },
      { side: 'east', tiles: Array.from({ length: depth }, (_, i) => ({ x: x + width - 1, y: y + i })) },
      { side: 'north', tiles: Array.from({ length: width }, (_, i) => ({ x: x + i, y })) },
      { side: 'west', tiles: Array.from({ length: depth }, (_, i) => ({ x, y: y + i })) },
    ]
    for (const { side, tiles } of sides) {
      const outward = DOOR_STEP[side]
      const middle = (tiles.length - 1) / 2
      const ranked = tiles
        .map((tile, index) => ({ tile, rank: Math.abs(index - middle), index }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
      const found = ranked.find(({ tile }) => opensOnto(tile.x + outward.x, tile.y + outward.y))
      if (found) return { tile: found.tile, side }
    }
    return null
  }
}

/** A small block to start from: two floors on the street, a core, corridors and four rooms, so people move at once. */
export function starterBuilding(): Building {
  const building = new Building()
  // The lot's street frontage is its +y edge; the starter block sits on it.
  const top = SITE_DEPTH - 12
  const rect = (x: number, y: number, width: number, depth: number): PlateTile[] =>
    Array.from({ length: width * depth }, (_, i) => ({ x: x + (i % width), y: top + y + Math.floor(i / width) }))
  const must = (result: EditResult) => {
    if (!result.ok) throw new Error(`Starter building: ${result.reason}`)
  }
  must(building.paintPlate(0, rect(12, 0, 16, 12)))
  must(building.paintCorridor(0, rect(13, 5, 14, 1)))
  must(building.paintCorridor(0, rect(21, 6, 1, 6)))
  must(building.inheritFloorBelow(1))
  must(building.paintCorridor(1, rect(13, 5, 14, 1)))
  must(building.placeCore(0, 19, top + 3))
  must(building.placeRoom('shop', 0, 22, top + 8))
  must(building.placeRoom('cafe', 0, 17, top + 6))
  must(building.placeRoom('office', 1, 13, top + 6, true))
  must(building.placeRoom('studio', 1, 22, top + 1))
  building.revision = 0
  return building
}
