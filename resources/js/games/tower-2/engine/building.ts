/**
 * The prototype's editable building: floor plates and cores (FloorPlateModel),
 * plus drawn corridors and fixed-size rooms. Every edit validates before it
 * changes anything and reports a player-facing reason when it refuses.
 */
import { FloorPlateModel, type FloorPlateSnapshot, type PlateTile, type VerticalFootprint } from './floorPlate'
import { carsIn, CORE_DEPTH, coreWidth, MAX_CARS, USE_KINDS, type UseKind, USES } from './uses'

export const SITE_WIDTH = 40
export const SITE_DEPTH = 40
/** The site's height limit: floors 0 (street) to HEIGHT_LIMIT - 1. */
export const HEIGHT_LIMIT = 24
/** Basements B1 to B3 are floors -1 to -BASEMENT_LIMIT. */
export const BASEMENT_LIMIT = 3

/** "G" for the street floor, "B1"… below it, the number above. */
export function floorLabel(floor: number): string {
  return floor === 0 ? 'G' : floor < 0 ? `B${-floor}` : String(floor)
}

/** A floor's name in sentences: "the street floor", "basement B1", "floor 3". */
export function floorName(floor: number): string {
  return floor === 0 ? 'the street floor' : floor < 0 ? `basement B${-floor}` : `floor ${floor}`
}

export interface Room {
  id: number
  use: UseKind
  floor: number
  x: number
  y: number
  width: number
  depth: number
  /** The wall the door is in, chosen by the player; it also sets the footprint's orientation. */
  facing: Facing
  /** A tile on the facing wall that opens onto a corridor, a core or, for a storefront, the outside. */
  door: PlateTile
  /** A ground-floor shop or café whose door opens straight onto the street side of the lot. */
  storefront: boolean
}

export type Facing = 'south' | 'east' | 'north' | 'west'

/** The outward step from a door in each wall. +y is the street. */
export const DOOR_STEP: Readonly<Record<Facing, PlateTile>> = {
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  north: { x: 0, y: -1 },
  west: { x: -1, y: 0 },
}

/** Quarter turns clockwise as seen from above, starting with the door toward the street. */
export const FACINGS: readonly Facing[] = ['south', 'west', 'north', 'east']

export function nextFacing(facing: Facing, turns = 1): Facing {
  return FACINGS[(((FACINGS.indexOf(facing) + turns) % 4) + 4) % 4]!
}

/** A room's footprint: its use's width runs along the door wall. */
export function roomFootprint(use: UseKind, facing: Facing): { width: number, depth: number } {
  const def = USES[use]
  return facing === 'south' || facing === 'north' ? { width: def.width, depth: def.depth } : { width: def.depth, depth: def.width }
}

/** Uses that can trade straight onto the street from the ground floor. */
export const STOREFRONT_USES: ReadonlySet<UseKind> = new Set(['shop', 'cafe'])

export type Core = VerticalFootprint

export type EditResult = { ok: true } | { ok: false, reason: string }

export type TileUse = 'empty' | 'plate' | 'corridor' | 'room' | 'core'

export interface RoomCheck {
  ok: boolean
  reason?: string | undefined
  door?: { tile: PlateTile, storefront: boolean } | undefined
  width: number
  depth: number
}

/**
 * What a saved room records. The door is kept as placed: later edits can
 * block it (paving over a storefront's doorway, erasing the corridor it opened
 * onto), which leaves the room unreachable but must not invalidate the save.
 */
export interface SavedRoom {
  id: number
  use: UseKind
  floor: number
  x: number
  y: number
  facing: Facing
  door: PlateTile
  storefront: boolean
}

/** Version 1 rooms stored a rotation flag and the door side the game picked. */
interface LegacyRoom {
  id: number
  use: UseKind
  floor: number
  x: number
  y: number
  rotated: boolean
  doorSide: Facing
}

export interface CoreCheck {
  ok: boolean
  reason?: string | undefined
  bottomFloor: number
  topFloor: number
}

/** One floor's tile mask: a base64 bitset over row-major indices, so its length is fixed by the site size. */
export interface TileMask {
  floor: number
  mask: string
}

/** A room as numbers: [id, use, floor, x, y, facing, doorX, doorY, storefront], with use and facing as indices into USE_KINDS and FACINGS. */
export type SavedRoomRow = [number, number, number, number, number, number, number, number, 0 | 1]

/**
 * A saved building. Version 3 is compact with a hard size bound: each tile
 * mask is a fixed-length bitset and each room a short row of numbers, so even
 * the fullest tower the rules allow fits the account save limit. Versions 1
 * and 2 listed every tile and room field, and still load.
 */
export interface BuildingSnapshot {
  version: 3
  plates: Omit<FloorPlateSnapshot, 'plates' | 'utilities'> & { plates: TileMask[], utilities: TileMask[] }
  corridors: TileMask[]
  rooms: SavedRoomRow[]
  nextRoomId: number
  nextCoreId: number
}

type TileList = { floor: number, tiles: number[] }

/** Saves from before version 3, whose masks list each tile and whose rooms are objects. */
type ListedSnapshot = Omit<BuildingSnapshot, 'version' | 'plates' | 'corridors' | 'rooms'> & { plates: FloorPlateSnapshot, corridors: TileList[], rooms: SavedRoom[] }

export type AnySnapshot = BuildingSnapshot
  | ListedSnapshot & { version: 2 }
  | Omit<ListedSnapshot, 'rooms'> & { version: 1, rooms: LegacyRoom[] }

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** Sorted tile indices below `cells` as a base64 bitset (bit i of byte i >> 3 is tile i). */
export function encodeMask(tiles: readonly number[], cells: number): string {
  const bytes = new Uint8Array(Math.ceil(cells / 8))
  for (const tile of tiles) bytes[tile >> 3]! |= 1 << (tile & 7)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The tile indices in a bitset; throws unless it is exactly the length the site needs. */
export function decodeMask(mask: string, cells: number): number[] {
  const length = Math.ceil(cells / 8)
  if (typeof mask !== 'string' || mask.length !== 4 * Math.ceil(length / 3) || !BASE64.test(mask)) throw new RangeError('A tile mask is malformed')
  const binary = atob(mask)
  if (binary.length !== length) throw new RangeError('A tile mask is malformed')
  const tiles: number[] = []
  for (let tile = 0; tile < cells; tile++) {
    if (binary.charCodeAt(tile >> 3) & (1 << (tile & 7))) tiles.push(tile)
  }
  return tiles
}

const OK: EditResult = { ok: true }

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function refuse(reason: string): EditResult {
  return { ok: false, reason }
}

export class Building {
  readonly width = SITE_WIDTH
  readonly depth = SITE_DEPTH
  readonly lowestFloor = -BASEMENT_LIMIT
  readonly highestFloor = HEIGHT_LIMIT - 1
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
    return Number.isSafeInteger(floor) && floor >= this.lowestFloor && floor <= this.highestFloor
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

  /** Floors with any plate, lowest first. */
  builtFloors(): number[] {
    const floors: number[] = []
    for (let floor = this.lowestFloor; floor <= this.highestFloor; floor++) if (this.plateArea(floor) > 0) floors.push(floor)
    return floors
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
    for (let level = floor; level <= this.highestFloor; level++) {
      if (inside.some(({ x, y }) => this.coreAt(level, x, y))) return refuse(`A core on ${floorName(level)} is in the way`)
    }
    if (!inside.some(({ x, y }) => this.hasPlate(floor, x, y))) return refuse('An atrium needs floor plate to cut')
    for (let level = floor; level <= this.highestFloor; level++) this.clearContents(level, inside)
    this.plates.carveAtrium(floor, this.highestFloor, inside)
    return this.changed()
  }

  inheritFloorBelow(floor: number): EditResult {
    if (!this.isFloor(floor) || !this.isFloor(floor - 1)) return refuse('There is no floor below to copy')
    if (this.plateArea(floor - 1) === 0) return refuse(`${capitalise(floorName(floor - 1))} has no plate to copy`)
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

  /**
   * Whether a room fits with its door in the `facing` wall. The door is the
   * tile nearest the middle of that wall that opens onto a corridor or core,
   * or onto the open lot for a street-floor shop or café. `ignoreId` lets a
   * room being moved overlap its own old footprint.
   */
  checkRoom(use: UseKind, floor: number, x: number, y: number, facing: Facing, ignoreId: number | null = null): RoomCheck {
    const { width, depth } = roomFootprint(use, facing)
    const result = (reason?: string, door?: RoomCheck['door']): RoomCheck => ({ ok: !reason, reason, door, width, depth })
    const problem = this.footprintProblem(floor, x, y, width, depth, ignoreId)
    if (problem) return result(problem)
    const storefronts = floor === 0 && STOREFRONT_USES.has(use)
    const door = this.doorFor(floor, x, y, width, depth, facing, storefronts)
    if (door) return result(undefined, door)
    const onto = storefronts ? 'a corridor, a core or the outside' : 'a corridor or core'
    return result(`Its door wall (${facing}) needs ${onto} beyond it. Turn the room.`)
  }

  placeRoom(use: UseKind, floor: number, x: number, y: number, facing: Facing = 'south'): EditResult {
    const check = this.checkRoom(use, floor, x, y, facing)
    if (!check.ok || !check.door) return refuse(check.reason ?? 'Cannot place that room')
    this.rooms.push({ id: this.nextRoomId++, use, floor, x, y, width: check.width, depth: check.depth, facing, door: check.door.tile, storefront: check.door.storefront })
    return this.changed()
  }

  /** Move and/or turn a placed room on its floor, keeping its identity. */
  moveRoom(id: number, x: number, y: number, facing: Facing): EditResult {
    const index = this.rooms.findIndex((room) => room.id === id)
    if (index < 0) return refuse('That room is already gone')
    const room = this.rooms[index]!
    const check = this.checkRoom(room.use, room.floor, x, y, facing, id)
    if (!check.ok || !check.door) return refuse(check.reason ?? 'Cannot move that room there')
    if (room.x === x && room.y === y && room.facing === facing) return refuse('The room is already there')
    this.rooms[index] = { ...room, x, y, width: check.width, depth: check.depth, facing, door: check.door.tile, storefront: check.door.storefront }
    return this.changed()
  }

  removeRoom(id: number): EditResult {
    const before = this.rooms.length
    this.rooms = this.rooms.filter((room) => room.id !== id)
    return before === this.rooms.length ? refuse('That room is already gone') : this.changed()
  }

  // ── Cores ─────────────────────────────────────────────────────────────────

  /** A new core stretches over the contiguous floors around this one where its footprint is free. */
  checkCore(floor: number, x: number, y: number, cars = 1): CoreCheck {
    const fail = (reason: string): CoreCheck => ({ ok: false, reason, bottomFloor: floor, topFloor: floor })
    if (!this.isFloor(floor)) return fail('That floor is outside the site')
    if (!Number.isSafeInteger(cars) || cars < 1 || cars > MAX_CARS) return fail(`A core holds 1 to ${MAX_CARS} cars`)
    const width = coreWidth(cars)
    if (!this.inBounds(x, y) || !this.inBounds(x + width - 1, y + CORE_DEPTH - 1)) return fail('Cores go inside the site')
    const reason = this.coreFloorProblem(floor, x, y, width)
    if (reason) return fail(reason)
    let bottomFloor = floor
    let topFloor = floor
    while (bottomFloor > this.lowestFloor && !this.coreFloorProblem(bottomFloor - 1, x, y, width)) bottomFloor--
    while (topFloor < this.highestFloor && !this.coreFloorProblem(topFloor + 1, x, y, width)) topFloor++
    return { ok: true, bottomFloor, topFloor }
  }

  placeCore(floor: number, x: number, y: number, cars = 1): EditResult {
    const check = this.checkCore(floor, x, y, cars)
    if (!check.ok) return refuse(check.reason ?? 'Cannot place a core here')
    this.plates.placeVerticalFootprint({
      id: `core-${this.nextCoreId++}`, kind: 'core', x, y, width: coreWidth(cars), depth: CORE_DEPTH,
      bottomFloor: check.bottomFloor, topFloor: check.topFloor,
    })
    return this.changed()
  }

  /** Add or remove cars; the core widens or narrows to the east on every floor it spans. */
  setCoreCars(id: string, cars: number): EditResult {
    const core = this.core(id)
    if (!core) return refuse('That core is already gone')
    if (!Number.isSafeInteger(cars) || cars < 1 || cars > MAX_CARS) return refuse(`A core holds 1 to ${MAX_CARS} cars`)
    if (cars === carsIn(core)) return refuse(`The core already has ${cars} ${cars === 1 ? 'car' : 'cars'}`)
    const width = coreWidth(cars)
    if (!this.inBounds(core.x + width - 1, core.y)) return refuse('A wider core would leave the site')
    for (let floor = core.bottomFloor; floor <= core.topFloor; floor++) {
      const reason = this.coreFloorProblem(floor, core.x, core.y, width, core.id)
      if (reason) return refuse(`${capitalise(floorName(floor))}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`)
    }
    this.plates.removeVerticalFootprint(core.id)
    this.plates.placeVerticalFootprint({ ...core, width })
    return this.changed()
  }

  /** Stretch or shorten a core; every floor in the new range must have free plate under it. */
  resizeCore(id: string, bottomFloor: number, topFloor: number): EditResult {
    const core = this.core(id)
    if (!core) return refuse('That core is already gone')
    if (!this.isFloor(bottomFloor) || !this.isFloor(topFloor) || bottomFloor > topFloor) return refuse('A core spans at least one floor of the site')
    for (let floor = bottomFloor; floor <= topFloor; floor++) {
      if (floor >= core.bottomFloor && floor <= core.topFloor) continue
      const reason = this.coreFloorProblem(floor, core.x, core.y, core.width)
      if (reason) return refuse(`${capitalise(floorName(floor))}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`)
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
    const cells = this.width * this.depth
    const plates = this.plates.snapshot()
    const compact = (lists: TileList[]): TileMask[] => lists.map(({ floor, tiles }) => ({ floor, mask: encodeMask(tiles, cells) }))
    return {
      version: 3,
      plates: { ...plates, plates: compact(plates.plates), utilities: compact(plates.utilities) },
      corridors: compact(corridors),
      rooms: this.rooms.map(({ id, use, floor, x, y, facing, door, storefront }): SavedRoomRow => [
        id, USE_KINDS.indexOf(use), floor, x, y, FACINGS.indexOf(facing), door.x, door.y, storefront ? 1 : 0,
      ]),
      nextRoomId: this.nextRoomId,
      nextCoreId: this.nextCoreId,
    }
  }

  /**
   * Replays a snapshot through the edit rules; throws when any part no longer
   * validates. Version 1 saves keep each room's footprint and turn it to a
   * facing whose wall still has a door, dropping rooms with none.
   */
  static fromSnapshot(snapshot: AnySnapshot): Building {
    if (snapshot?.version !== 1 && snapshot?.version !== 2 && snapshot?.version !== 3) throw new RangeError('Unknown building save version')
    const building = new Building()
    const cells = building.width * building.depth
    const listed = (lists: TileMask[]): TileList[] => lists.map(({ floor, mask }) => ({ floor, tiles: decodeMask(mask, cells) }))
    const plateSnapshot: FloorPlateSnapshot = snapshot.version === 3
      ? { ...snapshot.plates, plates: listed(snapshot.plates.plates), utilities: listed(snapshot.plates.utilities) }
      : snapshot.plates
    const corridorLists = snapshot.version === 3 ? listed(snapshot.corridors) : snapshot.corridors
    const plates = FloorPlateModel.fromSnapshot(plateSnapshot)
    if (plates.width !== building.width || plates.depth !== building.depth) throw new RangeError('Saved site has a different size')
    building.plates = plates
    for (const { floor, tiles } of corridorLists) {
      const result = building.paintCorridor(floor, tiles.map((index) => ({ x: index % building.width, y: Math.floor(index / building.width) })))
      if (!result.ok) throw new RangeError(result.reason)
    }
    if (snapshot.version === 1) {
      for (const room of snapshot.rooms) {
        // Keep the footprint: the old door side first, then any facing with the same width and depth.
        const def = USES[room.use]
        const width = room.rotated ? def.depth : def.width
        const facings = [room.doorSide, ...FACINGS.filter((facing) => facing !== room.doorSide)]
          .filter((facing) => roomFootprint(room.use, facing).width === width)
        for (const facing of facings) {
          building.nextRoomId = room.id
          if (building.placeRoom(room.use, room.floor, room.x, room.y, facing).ok) break
        }
      }
    } else if (snapshot.version === 2) {
      for (const room of snapshot.rooms) building.restoreRoom(room)
    } else {
      for (const row of snapshot.rooms) {
        if (!Array.isArray(row) || row.length !== 9) throw new RangeError('A saved room is malformed')
        const [id, use, floor, x, y, facing, doorX, doorY, storefront] = row
        building.restoreRoom({ id, use: USE_KINDS[use]!, floor, x, y, facing: FACINGS[facing]!, door: { x: doorX, y: doorY }, storefront: storefront === 1 })
      }
    }
    building.nextRoomId = Math.max(snapshot.nextRoomId, ...building.rooms.map((room) => room.id + 1), 1)
    building.nextCoreId = Math.max(snapshot.nextCoreId, 1)
    building.revision = 0
    return building
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private footprintProblem(floor: number, x: number, y: number, width: number, depth: number, ignoreId: number | null): string | null {
    if (!this.isFloor(floor)) return 'That floor is outside the site'
    for (let ty = y; ty < y + depth; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        const use = this.inBounds(tx, ty) ? this.tileUse(floor, tx, ty) : 'empty'
        if (use === 'empty') return 'Rooms need floor plate under every tile'
        if (use === 'room' && this.roomAt(floor, tx, ty)?.id === ignoreId) continue
        if (use !== 'plate') return `Overlaps a ${use}`
      }
    }
    return null
  }

  /** Put a saved room back as it was placed; only its footprint and door position must still hold. */
  private restoreRoom(saved: SavedRoom): void {
    if (!Number.isSafeInteger(saved.id) || saved.id < 1 || this.room(saved.id)) throw new RangeError('A saved room has a bad or repeated id')
    if (!(saved.use in USES) || !FACINGS.includes(saved.facing)) throw new RangeError('A saved room has an unknown use or facing')
    const { width, depth } = roomFootprint(saved.use, saved.facing)
    const problem = this.footprintProblem(saved.floor, saved.x, saved.y, width, depth, null)
    if (problem) throw new RangeError(problem)
    const { door } = saved
    const onWall = saved.facing === 'south' ? door.y === saved.y + depth - 1 && door.x >= saved.x && door.x < saved.x + width
      : saved.facing === 'north' ? door.y === saved.y && door.x >= saved.x && door.x < saved.x + width
        : saved.facing === 'east' ? door.x === saved.x + width - 1 && door.y >= saved.y && door.y < saved.y + depth
          : door.x === saved.x && door.y >= saved.y && door.y < saved.y + depth
    if (!onWall) throw new RangeError('A saved door is not on its room\'s door wall')
    this.rooms.push({ id: saved.id, use: saved.use, floor: saved.floor, x: saved.x, y: saved.y, width, depth, facing: saved.facing, door: { x: door.x, y: door.y }, storefront: saved.storefront === true })
    this.roomGridRevision = -1
  }

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

  /** Why a core footprint cannot stand on this floor; `ignoreId` lets a core overlap itself. */
  private coreFloorProblem(floor: number, x: number, y: number, width: number, ignoreId: string | null = null): string | null {
    for (let ty = y; ty < y + CORE_DEPTH; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        if (ignoreId !== null && this.coreAt(floor, tx, ty)?.id === ignoreId) continue
        const use = this.tileUse(floor, tx, ty)
        if (use === 'empty') return 'Cores need floor plate under every tile'
        if (use !== 'plate') return `Overlaps a ${use}`
      }
    }
    return null
  }

  /**
   * The tile nearest the middle of the facing wall whose outside neighbour is
   * a corridor or core, or, when storefronts are allowed, open lot or the
   * street beyond the site's +y edge.
   */
  private doorFor(floor: number, x: number, y: number, width: number, depth: number, facing: Facing, storefronts: boolean): { tile: PlateTile, storefront: boolean } | null {
    const wall = facing === 'south' ? Array.from({ length: width }, (_, i) => ({ x: x + i, y: y + depth - 1 }))
      : facing === 'north' ? Array.from({ length: width }, (_, i) => ({ x: x + i, y }))
        : facing === 'east' ? Array.from({ length: depth }, (_, i) => ({ x: x + width - 1, y: y + i }))
          : Array.from({ length: depth }, (_, i) => ({ x, y: y + i }))
    const outward = DOOR_STEP[facing]
    const middle = (wall.length - 1) / 2
    const ranked = wall
      .map((tile, index) => ({ tile, rank: Math.abs(index - middle), index }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
    for (const { tile } of ranked) {
      const ox = tile.x + outward.x
      const oy = tile.y + outward.y
      const use = this.inBounds(ox, oy) ? this.tileUse(floor, ox, oy) : 'empty'
      if (use === 'corridor' || use === 'core') return { tile, storefront: false }
      // Off the site, only the street side is public; the other edges are neighbours' lots.
      const outside = this.inBounds(ox, oy) ? use === 'empty' : oy === this.depth
      if (storefronts && outside) return { tile, storefront: true }
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
  must(building.placeRoom('shop', 0, 22, top + 8, 'west'))
  must(building.placeRoom('cafe', 0, 17, top + 6, 'east'))
  must(building.placeRoom('office', 1, 13, top + 6, 'north'))
  must(building.placeRoom('studio', 1, 22, top + 1, 'south'))
  building.revision = 0
  return building
}
