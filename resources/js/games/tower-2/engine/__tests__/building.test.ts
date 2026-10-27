import { Building, starterBuilding } from '../building'
import type { PlateTile } from '../floorPlate'

function rect(x: number, y: number, width: number, depth: number): PlateTile[] {
  return Array.from({ length: width * depth }, (_, i) => ({ x: x + (i % width), y: y + Math.floor(i / width) }))
}

/** A 10×8 slab on floors 0–2 with a corridor along y=4 and a core at its west end. */
function slab(): Building {
  const building = new Building()
  for (let floor = 0; floor <= 2; floor++) building.paintPlate(floor, rect(0, 0, 10, 8))
  building.paintCorridor(0, rect(2, 4, 8, 1))
  expect(building.placeCore(0, 0, 4)).toEqual({ ok: true })
  return building
}

describe('starter building', () => {
  test('is a valid two-floor lot with a street entrance, one core and four rooms', () => {
    const building = starterBuilding()
    expect(building.entrance()).toEqual({ x: 21, y: 39 })
    expect(building.cores().map(({ bottomFloor, topFloor }) => [bottomFloor, topFloor])).toEqual([[0, 1]])
    expect(building.allRooms().map((room) => [room.use, room.floor])).toEqual([['shop', 0], ['cafe', 0], ['office', 1], ['studio', 1]])
    expect(building.allRooms().map((room) => room.doorSide)).toEqual(['west', 'east', 'north', 'south'])
    expect(building.revision).toBe(0)
  })
})

describe('rooms', () => {
  test('need plate under every tile, free tiles and a corridor or core along a side', () => {
    const building = slab()
    expect(building.checkRoom('shop', 0, 8, 0, false).reason).toMatch('floor plate')
    expect(building.checkRoom('shop', 0, 3, 3, false).reason).toBe('Overlaps a corridor')
    expect(building.checkRoom('shop', 1, 3, 0, false).reason).toMatch('corridor or core')
    expect(building.placeRoom('shop', 0, 3, 1)).toEqual({ ok: true })
    expect(building.checkRoom('shop', 0, 4, 1, false).reason).toBe('Overlaps a room')
    // Street side (+y) wins: the door is the middle of the south edge, over the corridor.
    expect(building.room(1)).toMatchObject({ door: { x: 4, y: 3 }, doorSide: 'south' })
  })

  test('rotation swaps the footprint, and a door may open onto a core', () => {
    const building = slab()
    const check = building.checkRoom('office', 0, 2, 0, true)
    expect([check.width, check.depth]).toEqual([5, 4])
    expect(building.placeRoom('studio', 0, 0, 0)).toEqual({ ok: true })
    expect(building.room(1)).toMatchObject({ door: { x: 1, y: 3 }, doorSide: 'south' })
  })
})

describe('erasing, atriums and inheriting', () => {
  test('erase takes corridors and every touched room with the plate, but refuses cores', () => {
    const building = slab()
    building.placeRoom('shop', 0, 3, 1)
    expect(building.erase(0, [{ x: 0, y: 4 }]).ok).toBe(false)
    const revision = building.revision
    expect(building.erase(0, [{ x: 5, y: 3 }, { x: 5, y: 4 }])).toEqual({ ok: true })
    expect(building.revision).toBe(revision + 1)
    expect(building.allRooms()).toEqual([])
    expect(building.tileUse(0, 5, 4)).toBe('empty')
    expect(building.tileUse(0, 6, 4)).toBe('corridor')
    expect(building.erase(0, [{ x: 5, y: 4 }]).ok).toBe(false)
  })

  test('an atrium cuts from this floor to the top and clears what stood there', () => {
    const building = slab()
    building.paintCorridor(2, rect(2, 4, 8, 1))
    building.placeRoom('shop', 2, 3, 1)
    expect(building.carveAtrium(1, rect(4, 1, 2, 2))).toEqual({ ok: true })
    expect(building.hasPlate(0, 4, 1)).toBe(true)
    expect(building.hasPlate(1, 4, 1)).toBe(false)
    expect(building.hasPlate(2, 5, 2)).toBe(false)
    expect(building.roomsOn(2)).toEqual([])
    expect(building.carveAtrium(0, rect(0, 4, 1, 1)).ok).toBe(false)
  })

  test('inherit copies the outline below and clears rooms left hanging, unless a core would be', () => {
    const building = new Building()
    building.paintPlate(0, rect(0, 0, 6, 6))
    building.paintPlate(1, rect(0, 0, 9, 6))
    building.paintCorridor(1, rect(0, 3, 9, 1))
    building.placeRoom('shop', 1, 6, 0)
    expect(building.inheritFloorBelow(1)).toEqual({ ok: true })
    expect(building.plateArea(1)).toBe(36)
    expect(building.allRooms()).toEqual([])
    expect(building.tileUse(1, 2, 3)).toBe('corridor')
    building.paintPlate(1, rect(6, 0, 3, 6))
    building.paintPlate(2, rect(0, 0, 9, 6))
    building.placeCore(1, 7, 0)
    expect(building.inheritFloorBelow(1).ok).toBe(false)
    expect(building.inheritFloorBelow(0).ok).toBe(false)
  })
})

describe('cores', () => {
  test('stretch over contiguous free floors, then resize only onto free plate', () => {
    const building = slab()
    const core = building.cores()[0]!
    expect([core.bottomFloor, core.topFloor]).toEqual([0, 2])
    expect(building.resizeCore(core.id, 0, 3).ok).toBe(false)
    expect(building.resizeCore(core.id, 1, 2)).toEqual({ ok: true })
    building.paintCorridor(0, rect(0, 4, 2, 1))
    const blocked = building.resizeCore(core.id, 0, 2)
    expect(blocked).toEqual({ ok: false, reason: 'Floor 0: overlaps a corridor' })
    expect(building.checkCore(0, 0, 4).ok).toBe(false)
    expect(building.removeCore(core.id)).toEqual({ ok: true })
    expect(building.removeCore(core.id).ok).toBe(false)
  })
})

describe('snapshots', () => {
  test('round-trip through JSON and replay the edit rules', () => {
    const building = starterBuilding()
    const snapshot = JSON.parse(JSON.stringify(building.snapshot()))
    const copy = Building.fromSnapshot(snapshot)
    expect(copy.snapshot()).toEqual(building.snapshot())
    expect(copy.placeRoom('studio', 1, 22, 34).ok).toBe(true)
    expect(copy.room(5)).toBeDefined()
    const tampered = { ...snapshot, rooms: [...snapshot.rooms, { ...snapshot.rooms[0], id: 9 }] }
    expect(() => Building.fromSnapshot(tampered)).toThrow('Overlaps a room')
    expect(() => Building.fromSnapshot({ ...snapshot, version: 2 })).toThrow('version')
  })
})
