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
    expect(building.placeRoom('cafe', 1, 23, 34).ok).toBe(true)
    expect(analysis.rate(studio).noisy).toBe(false)
    const shopBelow = building.allRooms().find((room) => room.use === 'shop')!
    expect(building.placeRoom('studio', 1, shopBelow.x, shopBelow.y + 1, false).ok).toBe(false)
    const office = analysis.rate(building.allRooms().find((room) => room.use === 'office')!)
    expect(office.walk).toBeGreaterThan(0)
    expect(office.score).toBeGreaterThan(0)
    expect(starsFor(0.8)).toBe(3)
    expect(starsFor(0.29)).toBe(0)
  })

  test('a shop upstairs is noted and rated below one on the street', () => {
    const building = starterBuilding()
    building.placeRoom('shop', 1, 22, 34)
    const analysis = new BuildingAnalysis(building)
    const [street, upstairs] = building.allRooms().filter((room) => room.use === 'shop').map((room) => analysis.rate(room))
    expect(upstairs!.notes).toContain('Wants the street floor')
    expect(upstairs!.score).toBeLessThan(street!.score)
  })
})
