import { floorPathDistance, type FloorPathInput, FloorPaths, type FloorPoint, type FloorRoom, FloorTile } from '../floorPaths'

function grid(...rows: string[]): FloorPathInput {
  const kinds: Record<string, number> = { ' ': FloorTile.Empty, '.': FloorTile.Floor, '_': FloorTile.Corridor, '#': FloorTile.Wall, D: FloorTile.Door, C: FloorTile.Core }
  if (!rows.length || rows.some((row) => row.length !== rows[0]!.length)) throw new Error('Use a rectangular test floor')
  return { width: rows[0]!.length, depth: rows.length, tiles: Uint8Array.from(rows.join(''), (char) => kinds[char]!) }
}

/** Independent breadth-first oracle using coordinates, without the production adjacency table or heap. */
function breadthFirstDistance(floor: FloorPathInput, start: FloorPoint, goal: FloorPoint): number {
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < floor.width && y < floor.depth
    && [FloorTile.Floor, FloorTile.Corridor, FloorTile.Door, FloorTile.Core].includes(floor.tiles[y * floor.width + x]! as 1 | 2 | 4 | 5)
  if (!open(start.x, start.y) || !open(goal.x, goal.y)) return Infinity
  const queue = [{ ...start, distance: 0 }]
  const visited = new Set([`${start.x},${start.y}`])
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!
    if (current.x === goal.x && current.y === goal.y) return current.distance
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = current.x + dx!
      const y = current.y + dy!
      const key = `${x},${y}`
      if (!open(x, y) || visited.has(key)) continue
      visited.add(key)
      queue.push({ x, y, distance: current.distance + 1 })
    }
  }
  return Infinity
}

function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

const pointRoom = (x: number, y: number): FloorRoom => ({ id: `${x},${y}`, x, y, width: 1, depth: 1, door: { x, y } })

describe('floor walking geometry', () => {
  test('flood fills stable row-major regions through floors, corridors, doors and cores', () => {
    const paths = new FloorPaths(grid('..#.', 'D.#C', '##__'))
    expect(paths.connectedRegions()).toEqual({ count: 2, labels: Int32Array.from([0, 0, -1, 1, 0, 0, -1, 1, -1, -1, 1, 1]) })
    expect(paths.findPath({ x: 0, y: 1 }, { x: 2, y: 2 })).toBeNull()
    expect(paths.findPath({ x: 3, y: 0 }, { x: 2, y: 2 })).toEqual([{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 2 }])
    const kinds = new FloorPaths(grid(' ._DC#'))
    expect(kinds.connectedRegions().labels).toEqual(Int32Array.from([-1, 0, 0, 0, 0, -1]))
    expect(kinds.distance({ x: 1, y: 0 }, { x: 4, y: 0 })).toBe(3)
  })

  test('row boundaries and diagonal corners never create a walking edge', () => {
    const paths = new FloorPaths(grid('.#.', '.##'))
    expect(paths.connectedRegions().count).toBe(2)
    expect(paths.distance({ x: 2, y: 0 }, { x: 0, y: 1 })).toBe(Infinity)
    expect(new FloorPaths(grid('.#', '#.')).connectedRegions().count).toBe(2)
  })

  test('a room interior does not count as an outward opening when its door faces a wall', () => {
    const floor = grid('        ', ' ###    ', ' #.D#_C ', ' ###    ', '        ')
    const room: FloorRoom = { id: 'office', x: 1, y: 1, width: 3, depth: 3, door: { x: 3, y: 2 } }
    const closed = new FloorPaths(floor)
    expect(closed.roomsWithoutWalkableDoor([room])).toEqual([room])
    expect(closed.distanceToNearestCore(room)).toBe(Infinity)
    floor.tiles[2 * floor.width + 4] = FloorTile.Corridor
    const opened = new FloorPaths(floor)
    expect(opened.roomsWithoutWalkableDoor([room])).toEqual([])
    expect(opened.distanceToNearestCore(room)).toBe(3)
    expect(closed.roomsWithoutWalkableDoor([room])).toEqual([room])
  })

  test('checks doors on every outward edge, including corner and one-tile rooms', () => {
    const paths = new FloorPaths(grid('.....', '.....', '..C..', '.....', '.....'))
    for (const door of [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 3 }, { x: 1, y: 1 }]) {
      expect(paths.doorOpensOntoWalkable({ id: 'room', x: 1, y: 1, width: 3, depth: 3, door })).toBe(true)
    }
    expect(paths.doorOpensOntoWalkable({ id: 'internal', x: 1, y: 1, width: 3, depth: 3, door: { x: 2, y: 2 } })).toBe(false)
    expect(paths.doorOpensOntoWalkable(pointRoom(2, 1))).toBe(true)
    expect(paths.distanceToNearestCore(pointRoom(2, 1))).toBe(1)
  })

  test('flags missing/blocked/out-of-floor doors and invalid room rectangles without changing room order', () => {
    const paths = new FloorPaths(grid(' .#', '   '))
    const invalid = [pointRoom(0, 0), pointRoom(2, 0), pointRoom(3, 0), { ...pointRoom(1, 0), width: 0 }, { ...pointRoom(1, 0), door: { x: 0, y: 0 } }]
    expect(paths.roomsWithoutWalkableDoor(invalid)).toEqual(invalid)
    expect(paths.doorOpensOntoWalkable(pointRoom(1, 0))).toBe(false)
  })

  test('nearest-core scoring uses a reachable walking route rather than the nearest straight-line core', () => {
    const paths = new FloorPaths(grid('C#...C'))
    expect(paths.distanceToNearestCore(pointRoom(2, 0))).toBe(3)
    expect(new FloorPaths(grid('...')).distanceToNearestCore(pointRoom(1, 0))).toBe(Infinity)
    expect(new FloorPaths(grid('C')).distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0)
    expect(new FloorPaths(grid('C')).distanceToNearestCore(pointRoom(0, 0))).toBe(0)
  })

  test('amenity distance measures a ten-step detour, with stable north-first equal-cost paths', () => {
    const floor = grid('.....', '.###.', '.D#C.', '.###.', '.....')
    const paths = new FloorPaths(floor)
    const start = { x: 1, y: 2 }
    const goal = { x: 3, y: 2 }
    const expected = [{ x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 3, y: 2 }]
    expect(floorPathDistance(floor, start, goal)).toBe(10)
    for (let run = 0; run < 100; run++) {
      paths.distance(goal, start)
      paths.findPath({ x: 0, y: 0 }, { x: 4, y: 4 })
      expect(paths.findPath(start, goal)).toEqual(expected)
    }
  })

  test('open-grid equal-cost ties follow east before south when north is outside the floor', () => {
    expect(new FloorPaths(grid('...', '...', '...')).findPath({ x: 0, y: 0 }, { x: 2, y: 2 }))
      .toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }])
  })

  test('blocked/outside endpoints are unreachable and a walkable point-to-itself path contains its endpoint', () => {
    const paths = new FloorPaths(grid('.#', ' C'))
    const start = { x: 0, y: 0 }
    expect(paths.findPath(start, start)).toEqual([start])
    expect(floorPathDistance(paths, start, start)).toBe(0)
    for (const point of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 2, y: 1 }, { x: 0.5, y: 0 }, { x: NaN, y: 0 }]) {
      expect(paths.findPath(start, point)).toBeNull()
      expect(paths.distance(point, start)).toBe(Infinity)
      expect(paths.findPath(point, point)).toBeNull()
    }
  })

  test('matches an independent shortest-path oracle over seeded rectangular floors and repeated searches', () => {
    const random = seeded(0x71204)
    const floor = { width: 17, depth: 13, tiles: new Uint8Array(17 * 13) }
    for (let cell = 0; cell < floor.tiles.length; cell++) floor.tiles[cell] = random() < 0.27 ? FloorTile.Wall : FloorTile.Floor
    const paths = new FloorPaths(floor)
    for (let run = 0; run < 200; run++) {
      const start = { x: Math.floor(random() * floor.width), y: Math.floor(random() * floor.depth) }
      const goal = { x: Math.floor(random() * floor.width), y: Math.floor(random() * floor.depth) }
      const distance = breadthFirstDistance(floor, start, goal)
      expect(paths.distance(start, goal)).toBe(distance)
      const path = paths.findPath(start, goal)
      if (!Number.isFinite(distance)) expect(path).toBeNull()
      else {
        expect(path).toHaveLength(distance + 1)
        expect(path![0]).toEqual(start)
        expect(path!.at(-1)).toEqual(goal)
        for (let step = 1; step < path!.length; step++) {
          expect(Math.abs(path![step]!.x - path![step - 1]!.x) + Math.abs(path![step]!.y - path![step - 1]!.y)).toBe(1)
          expect(floor.tiles[path![step]!.y * floor.width + path![step]!.x]).toBe(FloorTile.Floor)
        }
      }
    }
  })

  test('owns its snapshot and returns region data that callers cannot use to stale the path index', () => {
    const floor = grid('D_C')
    const original = floor.tiles.slice()
    const paths = new FloorPaths(floor)
    paths.findPath({ x: 0, y: 0 }, { x: 2, y: 0 })
    expect(floor.tiles).toEqual(original)
    floor.tiles.fill(FloorTile.Empty)
    paths.connectedRegions().labels.fill(-1)
    expect(paths.distance({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(2)
    expect(paths.distanceToNearestCore(pointRoom(0, 0))).toBe(2)
    expect(paths.connectedRegions().count).toBe(1)
  })

  test.each([
    { width: 0, depth: 1, tiles: new Uint8Array() },
    { width: 2.5, depth: 1, tiles: new Uint8Array(2) },
    { width: 2, depth: -1, tiles: new Uint8Array(2) },
    { width: 3, depth: 2, tiles: new Uint8Array(5) },
    { width: 1, depth: 1, tiles: Uint8Array.of(255) },
  ])('rejects malformed floor input %j', (floor) => {
    expect(() => new FloorPaths(floor)).toThrow(RangeError)
  })

  test('200 A* paths on a 40×40 room-and-corridor floor fit within one 60 Hz frame', () => {
    const width = 40
    const tiles = new Uint8Array(width * width)
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
      tiles[y * width + x] = x % 8 === 0 || y % 8 === 0 ? FloorTile.Corridor
        : x % 8 === 1 || x % 8 === 7 || y % 8 === 1 || y % 8 === 7 ? FloorTile.Wall : FloorTile.Floor
      if (x % 8 === 4 && y % 8 === 1) tiles[y * width + x] = FloorTile.Door
    }
    tiles[0] = FloorTile.Core
    const floor = { width, depth: width, tiles }
    const paths = new FloorPaths(floor)
    const open: FloorPoint[] = []
    for (let cell = 0; cell < tiles.length; cell++) if (tiles[cell] !== FloorTile.Wall) open.push({ x: cell % width, y: Math.floor(cell / width) })
    const random = seeded(0x20040)
    const queries = Array.from({ length: 200 }, () => [open[Math.floor(random() * open.length)]!, open[Math.floor(random() * open.length)]!] as const)
    let checksum = 0
    const batch = (): void => {
      for (const [start, goal] of queries) checksum += paths.findPath(start, goal)!.length
    }
    batch() // Warm the JIT; no route cache exists, so every query still runs A*.
    const times: number[] = []
    for (let sample = 0; sample < 7; sample++) {
      const began = performance.now()
      batch()
      times.push(performance.now() - began)
    }
    times.sort((a, b) => a - b)
    const median = times[3]!
    console.log(`200 floor paths: median ${median.toFixed(2)} ms on a 40×40 room/corridor floor`)
    expect(checksum).toBeGreaterThan(8 * 200 * 10)
    expect(median).toBeLessThan(1000 / 60)
  })
})
