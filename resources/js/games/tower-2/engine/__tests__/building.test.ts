import { Building, FACINGS, nextFacing, starterBuilding } from '../building'
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
    expect(building.allRooms().map((room) => room.facing)).toEqual(['west', 'east', 'north', 'south'])
    expect(building.revision).toBe(0)
  })
})

describe('rooms', () => {
  test('need plate under every tile, free tiles and a corridor or core beyond the door wall', () => {
    const building = slab()
    expect(building.checkRoom('shop', 0, 8, 0, 'south').reason).toMatch('floor plate')
    expect(building.checkRoom('shop', 0, 3, 3, 'south').reason).toBe('Overlaps a corridor')
    expect(building.checkRoom('shop', 1, 3, 0, 'south').reason).toMatch('corridor or core')
    expect(building.placeRoom('shop', 0, 3, 1)).toEqual({ ok: true })
    expect(building.checkRoom('shop', 0, 4, 1, 'south').reason).toBe('Overlaps a room')
    // The door is the middle of the chosen wall, over the corridor.
    expect(building.room(1)).toMatchObject({ door: { x: 4, y: 3 }, facing: 'south', storefront: false })
  })

  test('the facing picks the door wall and turns the footprint, and a door may open onto a core', () => {
    const building = slab()
    const check = building.checkRoom('office', 0, 2, 0, 'east')
    expect([check.width, check.depth]).toEqual([5, 4])
    // Facing north, the same spot has no corridor beyond the door wall.
    expect(building.checkRoom('shop', 0, 3, 1, 'north').reason).toMatch('Turn the room')
    expect(building.placeRoom('studio', 0, 0, 0)).toEqual({ ok: true })
    expect(building.room(1)).toMatchObject({ door: { x: 1, y: 3 }, facing: 'south' })
    expect(FACINGS.map((facing) => nextFacing(facing))).toEqual(['west', 'north', 'east', 'south'])
    expect(nextFacing('south', -1)).toBe('east')
  })

  test('a street-floor shop or café facing open lot or the street is a storefront; other uses and floors are not', () => {
    // A block set back from the lot edges, so open lot surrounds it.
    const building = new Building()
    building.paintPlate(0, rect(2, 2, 8, 6))
    building.paintPlate(1, rect(2, 2, 8, 6))
    expect(building.placeRoom('cafe', 0, 4, 2, 'north')).toEqual({ ok: true })
    expect(building.room(1)).toMatchObject({ facing: 'north', storefront: true, door: { x: 5, y: 2 } })
    expect(building.checkRoom('studio', 0, 2, 4, 'west').ok).toBe(false)
    expect(building.checkRoom('shop', 1, 2, 2, 'north').ok).toBe(false)
    // A wall on a neighbour's lot (the site's west edge) is not public.
    expect(slab().checkRoom('shop', 0, 0, 0, 'west').ok).toBe(false)
    // On the site's +y edge the door opens straight onto the street.
    const street = new Building()
    street.paintPlate(0, rect(0, 37, 6, 3))
    expect(street.placeRoom('shop', 0, 1, 37, 'south')).toEqual({ ok: true })
    expect(street.room(1)).toMatchObject({ storefront: true, door: { x: 2, y: 39 } })
  })

  test('move and turn a placed room, keeping its identity and refusing bad spots', () => {
    const building = slab()
    building.placeRoom('shop', 0, 3, 1)
    const revision = building.revision
    expect(building.moveRoom(1, 6, 1, 'south')).toEqual({ ok: true })
    expect(building.room(1)).toMatchObject({ x: 6, y: 1, door: { x: 7, y: 3 } })
    expect(building.revision).toBe(revision + 1)
    // Overlapping its own old footprint is fine.
    expect(building.moveRoom(1, 5, 1, 'south')).toEqual({ ok: true })
    expect(building.moveRoom(1, 5, 1, 'south')).toEqual({ ok: false, reason: 'The room is already there' })
    expect(building.moveRoom(1, 5, 1, 'north').ok).toBe(false)
    expect(building.moveRoom(1, 3, 3, 'south')).toEqual({ ok: false, reason: 'Overlaps a corridor' })
    expect(building.room(1)).toMatchObject({ x: 5, y: 1 })
    expect(building.moveRoom(99, 0, 0, 'south').ok).toBe(false)
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
    expect(copy.placeRoom('studio', 1, 22, 34, 'north').ok).toBe(true)
    expect(copy.room(5)).toBeDefined()
    const tampered = { ...snapshot, rooms: [...snapshot.rooms, { ...snapshot.rooms[0], id: 9 }] }
    expect(() => Building.fromSnapshot(tampered)).toThrow('Overlaps a room')
    expect(() => Building.fromSnapshot({ ...snapshot, version: 3 })).toThrow('version')
  })

  test('every state the edit rules allow survives a save, including rooms whose door was blocked later', () => {
    const blockers: [string, (building: Building) => number][] = [
      ['paving over a storefront doorway', (building) => {
        building.paintPlate(0, rect(10, 30, 3, 3))
        building.placeRoom('shop', 0, 10, 30, 'south')
        building.paintPlate(0, rect(10, 33, 3, 1))
        return 1
      }],
      ['erasing the corridor a door opens onto', (building) => {
        building.paintPlate(0, rect(0, 0, 10, 8))
        building.paintCorridor(0, rect(0, 4, 10, 1))
        building.placeRoom('shop', 0, 3, 1, 'south')
        building.erase(0, rect(0, 4, 10, 1))
        return 1
      }],
      ['removing the core a door opens onto', (building) => {
        building.paintPlate(0, rect(0, 0, 10, 8))
        building.placeCore(0, 4, 4)
        building.placeRoom('shop', 0, 3, 1, 'south')
        building.removeCore(building.cores()[0]!.id)
        return 1
      }],
      ['shortening the core a door opens onto', (building) => {
        for (const floor of [0, 1]) building.paintPlate(floor, rect(0, 0, 10, 8))
        building.placeCore(0, 4, 4)
        building.placeRoom('shop', 1, 3, 1, 'south')
        building.resizeCore(building.cores()[0]!.id, 0, 0)
        return 1
      }],
    ]
    for (const [edit, block] of blockers) {
      const building = new Building()
      const id = block(building)
      expect([edit, building.room(id)]).toEqual([edit, expect.objectContaining({ id })])
      const copy = Building.fromSnapshot(JSON.parse(JSON.stringify(building.snapshot())))
      expect([edit, copy.snapshot()]).toEqual([edit, building.snapshot()])
    }
  })

  test('a saved door must sit on its room\'s door wall', () => {
    const snapshot = JSON.parse(JSON.stringify(starterBuilding().snapshot()))
    snapshot.rooms[0].door = { x: 0, y: 0 }
    expect(() => Building.fromSnapshot(snapshot)).toThrow('door wall')
  })

  test('version 1 saves keep each room in place and turn it to a facing that has a door', () => {
    const snapshot = starterBuilding().snapshot()
    const legacy = {
      ...snapshot,
      version: 1 as const,
      rooms: [
        // Saved with the game's own door pick on a matching wall: kept as it was.
        { id: 1, use: 'shop' as const, floor: 0, x: 22, y: 36, rotated: false, doorSide: 'west' as const },
        // An unrotated room keeps its footprint and gets whichever of south or north has a door.
        { id: 2, use: 'studio' as const, floor: 1, x: 22, y: 29, rotated: false, doorSide: 'east' as const },
        // A room that fits nowhere any more is dropped rather than failing the whole save.
        { id: 3, use: 'office' as const, floor: 1, x: 30, y: 0, rotated: true, doorSide: 'north' as const },
      ],
    }
    const building = Building.fromSnapshot(legacy)
    expect(building.allRooms().map(({ id, x, y, facing }) => [id, x, y, facing])).toEqual([[1, 22, 36, 'west'], [2, 22, 29, 'south']])
  })
})
