/** Pure per-floor walking geometry; callers supply tile kinds independently of floor editing. */
export const FloorTile = {
  Empty: 0,
  Floor: 1,
  Corridor: 2,
  Wall: 3,
  Door: 4,
  Core: 5,
} as const

export type FloorTileKind = typeof FloorTile[keyof typeof FloorTile]

export interface FloorPoint { x: number, y: number }
export interface FloorPathInput { width: number, depth: number, tiles: Uint8Array }
export interface FloorRoom {
  id: string
  x: number
  y: number
  width: number
  depth: number
  /** A perimeter tile, inside the room rectangle. Walls are supplied in the tile input. */
  door: FloorPoint
}
export interface WalkableRegions {
  count: number
  /** Row-major component ids, numbered from zero; blocked cells have id -1. */
  labels: Int32Array
}

/** Floor and corridor are both allowed, so choosing drawn corridors remains a caller decision. */
export function isWalkableFloorTile(kind: number): boolean {
  return kind === FloorTile.Floor || kind === FloorTile.Corridor || kind === FloorTile.Door || kind === FloorTile.Core
}

/**
 * An owned snapshot of one floor. Reuse it for scoring/path queries, and rebuild it after edits.
 * Four-neighbor paths use unit costs. A* ties use lowest f, lowest h, then first discovery;
 * neighbors are visited north, east, south, west. Room ordering cannot affect a route.
 */
export class FloorPaths {
  readonly width: number
  readonly depth: number
  private readonly neighbors: Int32Array
  private readonly regions: Int32Array
  private readonly coreDistances: Int32Array
  private readonly landmarkDistances: readonly Int32Array[]
  private readonly regionCount: number
  private readonly seen: Uint32Array
  private readonly closed: Uint32Array
  private readonly scores: Uint32Array
  private readonly heuristics: Uint32Array
  private readonly discovery: Uint32Array
  private readonly parents: Int32Array
  private readonly heap: Int32Array
  private readonly positions: Int32Array
  private epoch = 0
  private heapSize = 0

  constructor(input: FloorPathInput) {
    const cells = input.width * input.depth
    if (!Number.isSafeInteger(input.width) || input.width <= 0 || !Number.isSafeInteger(input.depth) || input.depth <= 0
      || !Number.isSafeInteger(cells) || cells > 0x7fffffff) throw new RangeError('Floor dimensions must be positive integers within the tile index range')
    if (!(input.tiles instanceof Uint8Array) || input.tiles.length !== cells) throw new RangeError('Tile data must match the floor dimensions')
    if (input.tiles.some((kind) => kind > FloorTile.Core)) throw new RangeError('Unknown floor tile kind')
    this.width = input.width
    this.depth = input.depth
    // Derived arrays own their data: later mutations of the supplied tiles cannot stale this snapshot.
    this.neighbors = new Int32Array(cells * 4).fill(-1)
    this.regions = new Int32Array(cells).fill(-1)
    this.coreDistances = new Int32Array(cells).fill(-1)
    this.seen = new Uint32Array(cells)
    this.closed = new Uint32Array(cells)
    this.scores = new Uint32Array(cells)
    this.heuristics = new Uint32Array(cells)
    this.discovery = new Uint32Array(cells)
    this.parents = new Int32Array(cells)
    this.heap = new Int32Array(cells)
    this.positions = new Int32Array(cells)
    for (let cell = 0; cell < cells; cell++) {
      if (!isWalkableFloorTile(input.tiles[cell]!)) continue
      const x = cell % this.width
      const y = Math.floor(cell / this.width)
      const adjacent = [y > 0 ? cell - this.width : -1, x + 1 < this.width ? cell + 1 : -1,
        y + 1 < this.depth ? cell + this.width : -1, x > 0 ? cell - 1 : -1]
      for (let direction = 0; direction < 4; direction++) {
        const neighbor = adjacent[direction]!
        if (neighbor >= 0 && isWalkableFloorTile(input.tiles[neighbor]!)) this.neighbors[cell * 4 + direction] = neighbor
      }
    }
    const queue = new Int32Array(cells)
    let count = 0
    for (let cell = 0; cell < cells; cell++) {
      if (!isWalkableFloorTile(input.tiles[cell]!) || this.regions[cell] !== -1) continue
      let head = 0
      let tail = 1
      queue[0] = cell
      this.regions[cell] = count
      while (head < tail) {
        const current = queue[head++]!
        for (let direction = 0; direction < 4; direction++) {
          const next = this.neighbors[current * 4 + direction]!
          if (next < 0 || this.regions[next] !== -1) continue
          this.regions[next] = count
          queue[tail++] = next
        }
      }
      count++
    }
    this.regionCount = count

    // One multi-source BFS makes repeated room-to-core scoring an O(1) lookup.
    let head = 0
    let tail = 0
    for (let cell = 0; cell < cells; cell++) {
      if (input.tiles[cell] !== FloorTile.Core) continue
      this.coreDistances[cell] = 0
      queue[tail++] = cell
    }
    while (head < tail) {
      const current = queue[head++]!
      for (let direction = 0; direction < 4; direction++) {
        const next = this.neighbors[current * 4 + direction]!
        if (next < 0 || this.coreDistances[next] !== -1) continue
        this.coreDistances[next] = this.coreDistances[current]! + 1
        queue[tail++] = next
      }
    }
    // A few deterministic far-apart landmarks tighten Manhattan's bound around
    // walls. |d(landmark, cell) - d(landmark, goal)| is admissible and consistent
    // on this undirected unit-cost graph, so A* still returns an exact shortest path.
    const landmarks: Int32Array[] = []
    const nearest = new Int32Array(cells).fill(0x7fffffff)
    let landmark = this.regions.findIndex((region) => region >= 0)
    for (let count = 0; count < 8 && landmark >= 0; count++) {
      const distances = new Int32Array(cells).fill(-1)
      distances[landmark] = 0
      head = 0
      tail = 1
      queue[0] = landmark
      while (head < tail) {
        const current = queue[head++]!
        for (let direction = 0; direction < 4; direction++) {
          const next = this.neighbors[current * 4 + direction]!
          if (next < 0 || distances[next] !== -1) continue
          distances[next] = distances[current]! + 1
          queue[tail++] = next
        }
      }
      landmarks.push(distances)
      landmark = -1
      let farthest = 0
      for (let cell = 0; cell < cells; cell++) {
        if (this.regions[cell] === -1) continue
        if (distances[cell]! >= 0) nearest[cell] = Math.min(nearest[cell]!, distances[cell]!)
        if (nearest[cell]! > farthest) {
          farthest = nearest[cell]!
          landmark = cell
        }
      }
    }
    this.landmarkDistances = landmarks
  }

  connectedRegions(): WalkableRegions {
    return { count: this.regionCount, labels: this.regions.slice() }
  }

  /** An inward room tile is not an outward opening; corner doors may open along either edge. */
  doorOpensOntoWalkable(room: FloorRoom): boolean {
    if (![room.x, room.y, room.width, room.depth].every(Number.isSafeInteger) || room.width <= 0 || room.depth <= 0
      || room.x < 0 || room.y < 0 || room.x + room.width > this.width || room.y + room.depth > this.depth) return false
    const door = this.index(room.door)
    if (door < 0 || this.regions[door] === -1) return false
    const { x, y } = room.door
    const right = room.x + room.width - 1
    const bottom = room.y + room.depth - 1
    if (x < room.x || x > right || y < room.y || y > bottom) return false
    return (y === room.y && this.neighbors[door * 4]! >= 0)
      || (x === right && this.neighbors[door * 4 + 1]! >= 0)
      || (y === bottom && this.neighbors[door * 4 + 2]! >= 0)
      || (x === room.x && this.neighbors[door * 4 + 3]! >= 0)
  }

  roomsWithoutWalkableDoor(rooms: readonly FloorRoom[]): FloorRoom[] {
    return rooms.filter((room) => !this.doorOpensOntoWalkable(room))
  }

  /** Number of tile steps, with Infinity for an unreachable or blocked endpoint. */
  distance(from: FloorPoint, to: FloorPoint): number {
    const length = this.search(from, to)
    return length < 0 ? Infinity : length
  }

  /** Includes both endpoints; no path is null, and a point-to-itself path has one tile. */
  findPath(from: FloorPoint, to: FloorPoint): FloorPoint[] | null {
    if (this.search(from, to) < 0) return null
    const path: FloorPoint[] = []
    for (let cell = this.index(to); cell !== -1; cell = this.parents[cell]!) {
      path.push({ x: cell % this.width, y: (cell / this.width) | 0 })
    }
    return path.reverse()
  }

  /** Walking distance from the door; room-opening validation remains a separate query. */
  distanceToNearestCore(room: Pick<FloorRoom, 'door'>): number {
    const index = this.index(room.door)
    if (index < 0) return Infinity
    const distance = this.coreDistances[index]!
    return distance < 0 ? Infinity : distance
  }

  private index(point: FloorPoint): number {
    return Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y) && point.x >= 0 && point.x < this.width
      && point.y >= 0 && point.y < this.depth ? point.y * this.width + point.x : -1
  }

  private search(from: FloorPoint, to: FloorPoint): number {
    const start = this.index(from)
    const goal = this.index(to)
    if (start < 0 || goal < 0 || this.regions[start] === -1 || this.regions[start] !== this.regions[goal]) return -1
    this.epoch = (this.epoch + 1) >>> 0
    if (this.epoch === 0) {
      this.seen.fill(0)
      this.closed.fill(0)
      this.epoch = 1
    }
    const epoch = this.epoch
    const targets = this.landmarkDistances.map((distances) => distances[goal]!)
    const heuristic = (cell: number): number => {
      const dx = cell % this.width - to.x
      const dy = ((cell / this.width) | 0) - to.y
      let estimate = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy)
      for (let index = 0; index < targets.length; index++) {
        const distance = this.landmarkDistances[index]![cell]!
        if (distance >= 0 && targets[index]! >= 0) {
          const difference = distance - targets[index]!
          const bound = difference < 0 ? -difference : difference
          if (bound > estimate) estimate = bound
        }
      }
      return estimate
    }
    this.heapSize = 1
    this.heap[0] = start
    this.positions[start] = 0
    this.seen[start] = epoch
    this.scores[start] = 0
    this.heuristics[start] = heuristic(start)
    this.discovery[start] = 0
    this.parents[start] = -1
    let sequence = 1
    while (this.heapSize > 0) {
      const current = this.pop()
      if (current === goal) return this.scores[current]!
      this.closed[current] = epoch
      for (let direction = 0; direction < 4; direction++) {
        const next = this.neighbors[current * 4 + direction]!
        if (next < 0 || this.closed[next] === epoch) continue
        const score = this.scores[current]! + 1
        if (this.seen[next] === epoch) {
          if (score >= this.scores[next]!) continue
          this.scores[next] = score
          this.parents[next] = current
          this.bubbleUp(this.positions[next]!)
        } else {
          this.seen[next] = epoch
          this.scores[next] = score
          this.heuristics[next] = heuristic(next)
          this.discovery[next] = sequence++
          this.parents[next] = current
          this.heap[this.heapSize] = next
          this.positions[next] = this.heapSize
          this.bubbleUp(this.heapSize++)
        }
      }
    }
    return -1
  }

  private before(a: number, b: number): boolean {
    const difference = this.scores[a]! + this.heuristics[a]! - this.scores[b]! - this.heuristics[b]!
    return difference < 0 || (difference === 0 && (this.heuristics[a]! < this.heuristics[b]!
      || (this.heuristics[a] === this.heuristics[b] && this.discovery[a]! < this.discovery[b]!)))
  }

  private bubbleUp(position: number): void {
    const cell = this.heap[position]!
    while (position > 0) {
      const parent = (position - 1) >>> 1
      const other = this.heap[parent]!
      if (!this.before(cell, other)) break
      this.heap[position] = other
      this.positions[other] = position
      position = parent
    }
    this.heap[position] = cell
    this.positions[cell] = position
  }

  private pop(): number {
    const first = this.heap[0]!
    const last = this.heap[--this.heapSize]!
    if (this.heapSize > 0) {
      let position = 0
      while (position * 2 + 1 < this.heapSize) {
        let child = position * 2 + 1
        if (child + 1 < this.heapSize && this.before(this.heap[child + 1]!, this.heap[child]!)) child++
        const next = this.heap[child]!
        if (!this.before(next, last)) break
        this.heap[position] = next
        this.positions[next] = position
        position = child
      }
      this.heap[position] = last
      this.positions[last] = position
    }
    return first
  }
}

/** Amenity/restroom scoring uses walking steps, not straight-line separation. Reuse a snapshot for batches. */
export function floorPathDistance(floor: FloorPathInput | FloorPaths, from: FloorPoint, to: FloorPoint): number {
  return (floor instanceof FloorPaths ? floor : new FloorPaths(floor)).distance(from, to)
}
