import { BuildingAnalysis, DAYLIGHT_CAP, daylightField, lightLevel, starsFor } from '../analysis'
import { Building, starterBuilding } from '../building'
import type { PlateTile } from '../floorPlate'

function rect(x: number, y: number, width: number, depth: number): PlateTile[] {
  return Array.from({ length: width * depth }, (_, i) => ({ x: x + (i % width), y: y + Math.floor(i / width) }))
}

describe('daylight', () => {
  test('counts steps to the nearest edge or hole, capped, and is zero off the plate', () => {
    const plate = new Uint8Array(20 * 20)
    for (const { x, y } of rect(1, 1, 18, 18)) plate[y * 20 + x] = 1
    plate[10 * 20 + 10] = 0
    const field = daylightField(plate, 20, 20)
    expect(field[0]).toBe(0)
    expect(field[1 * 20 + 1]).toBe(1)
    expect(field[1 * 20 + 5]).toBe(1)
    expect(field[3 * 20 + 3]).toBe(3)
    expect(field[10 * 20 + 11]).toBe(1)
    expect(field[5 * 20 + 6]).toBe(5)
    expect(Math.max(...field)).toBe(DAYLIGHT_CAP)
    expect(lightLevel(1)).toBe(1)
    expect(lightLevel(0)).toBe(0)
    expect(lightLevel(DAYLIGHT_CAP)).toBeCloseTo(1 / DAYLIGHT_CAP)
  })
})

describe('street service', () => {
  test('rooms above the street are served only through a core that reaches them', () => {
    const building = starterBuilding()
    const analysis = new BuildingAnalysis(building)
    const office = building.allRooms().find((room) => room.use === 'office')!
    expect(analysis.rate(office).reachable).toBe(true)
    expect(analysis.route(1, office.door)!.map((hop) => [hop.floor, hop.toFloor])).toEqual([[0, 1]])
    building.removeCore(building.cores()[0]!.id)
    const rating = analysis.rate(office)
    expect(rating).toMatchObject({ reachable: false, score: 0, stars: 0 })
    expect(rating.notes).toContain('No route from the street')
    expect(analysis.route(1, office.door)).toBeNull()
  })

  test('a high-rise core reached by transfer at a sky lobby serves the floors above', () => {
    const building = new Building()
    for (let floor = 0; floor <= 4; floor++) building.paintPlate(floor, rect(0, 0, 12, 8))
    for (let floor = 0; floor <= 4; floor++) building.paintCorridor(floor, rect(0, 7, 12, 1))
    building.placeCore(2, 2, 5)
    building.resizeCore('core-1', 0, 2)
    building.placeCore(2, 8, 5)
    building.resizeCore('core-2', 2, 4)
    building.placeRoom('office', 4, 4, 2)
    const analysis = new BuildingAnalysis(building)
    const office = building.roomsOn(4)[0]!
    expect(analysis.route(4, office.door)!.map((hop) => [hop.floor, hop.core.id, hop.toFloor])).toEqual([[0, 'core-1', 2], [2, 'core-2', 4]])
    expect(analysis.servedRegions(3).size).toBe(1)
    // Cut the sky-lobby corridor between the two cores and the high floors lose service.
    building.erase(2, rect(5, 7, 1, 1))
    expect(analysis.rate(office).reachable).toBe(false)
  })
})

describe('room ratings', () => {
  test('studios hear shops beside or below them; offices like light and short walks', () => {
    const building = starterBuilding()
    const analysis = new BuildingAnalysis(building)
    const studio = building.allRooms().find((room) => room.use === 'studio')!
    expect(analysis.rate(studio).noisy).toBe(false)
    expect(building.placeRoom('cafe', 1, 23, 34, 'north').ok).toBe(true)
    expect(analysis.rate(studio).noisy).toBe(false)
    const shopBelow = building.allRooms().find((room) => room.use === 'shop')!
    expect(building.placeRoom('studio', 1, shopBelow.x, shopBelow.y + 1, 'south').ok).toBe(false)
    const office = analysis.rate(building.allRooms().find((room) => room.use === 'office')!)
    expect(office.walk).toBeGreaterThan(0)
    expect(office.score).toBeGreaterThan(0)
    expect(starsFor(0.8)).toBe(3)
    expect(starsFor(0.29)).toBe(0)
  })

  test('a shop upstairs is noted and rated below one on the street', () => {
    const building = starterBuilding()
    building.placeRoom('shop', 1, 22, 34, 'north')
    const analysis = new BuildingAnalysis(building)
    const [street, upstairs] = building.allRooms().filter((room) => room.use === 'shop').map((room) => analysis.rate(room))
    expect(upstairs!.notes).toContain('Wants the street floor')
    expect(upstairs!.score).toBeLessThan(street!.score)
  })
})

describe('storefronts', () => {
  /** A street-floor block set back four rows from the street, with a courtyard cut into it. */
  function block(): Building {
    const building = new Building()
    building.paintPlate(0, rect(10, 26, 12, 10))
    building.erase(0, rect(14, 28, 4, 4))
    return building
  }

  test('walk in across the open lot, and trade better the nearer the street', () => {
    const building = block()
    expect(building.placeRoom('shop', 0, 12, 33, 'south')).toEqual({ ok: true })
    const analysis = new BuildingAnalysis(building)
    const shop = building.room(1)!
    // From the street row up to the tile outside the door.
    expect(analysis.storefrontApproach(shop)).toEqual([{ x: 13, y: 39 }, { x: 13, y: 38 }, { x: 13, y: 37 }, { x: 13, y: 36 }])
    const rating = analysis.rate(shop)
    expect(rating.reachable).toBe(true)
    expect(rating.footfall).toBeCloseTo(1 - 4 / 30)
    expect(rating.stars).toBe(3)
    // The far side of the block is a longer walk round, so less footfall.
    expect(building.placeRoom('shop', 0, 10, 26, 'north')).toEqual({ ok: true })
    const back = analysis.rate(building.room(2)!)
    expect(back.reachable).toBe(true)
    expect(back.footfall).toBeLessThan(rating.footfall)
  })

  test('one facing a walled-in courtyard has no way in from the street', () => {
    const building = block()
    expect(building.placeRoom('cafe', 0, 14, 32, 'north')).toEqual({ ok: true })
    const analysis = new BuildingAnalysis(building)
    const cafe = building.room(1)!
    expect(cafe.storefront).toBe(true)
    expect(analysis.storefrontApproach(cafe)).toBeNull()
    expect(analysis.rate(cafe)).toMatchObject({ reachable: false, stars: 0 })
    expect(analysis.rate(cafe).notes).toContain('No route from the street')
  })

  test('a door on the site\'s street edge opens straight onto the street', () => {
    const building = new Building()
    building.paintPlate(0, rect(0, 37, 6, 3))
    building.placeRoom('shop', 0, 1, 37, 'south')
    const analysis = new BuildingAnalysis(building)
    expect(analysis.storefrontApproach(building.room(1)!)).toEqual([])
    expect(analysis.rate(building.room(1)!).footfall).toBe(1)
  })
})

describe('basements', () => {
  test('have no daylight, are reached by riding a core down, and say why rooms there are dark', () => {
    const building = new Building()
    for (const floor of [-1, 0]) {
      building.paintPlate(floor, rect(10, 30, 12, 10))
      building.paintCorridor(floor, rect(10, 39, 12, 1))
    }
    building.placeCore(0, 10, 37)
    building.placeRoom('office', -1, 14, 34, 'south')
    const analysis = new BuildingAnalysis(building)
    expect(analysis.daylight(-1).every((value) => value === 0)).toBe(true)
    const office = building.roomsOn(-1)[0]!
    expect(analysis.route(-1, office.door)!.map((hop) => [hop.floor, hop.toFloor])).toEqual([[0, -1]])
    const rating = analysis.rate(office)
    expect(rating).toMatchObject({ reachable: true, light: 0 })
    expect(rating.notes).toContain('Underground: no daylight')
  })
})
