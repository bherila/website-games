import { BuildingAnalysis } from '../analysis'
import { Building, starterBuilding } from '../building'
import { CAR_CAPACITY, Crowd, hallTile, planVisit, positionOnLeg } from '../people'

describe('visits', () => {
  test('walk in from the street, ride the core, visit and return the same way', () => {
    const building = starterBuilding()
    const analysis = new BuildingAnalysis(building)
    const office = building.allRooms().find((room) => room.use === 'office')!
    const legs = planVisit(analysis, office, 5)!
    expect(legs.map((leg) => leg.kind)).toEqual(['walk', 'ride', 'walk', 'dwell', 'walk', 'ride', 'walk'])
    expect(legs[0]).toMatchObject({ kind: 'walk', floor: 0 })
    expect(legs[0]!.kind === 'walk' && legs[0]!.points.slice(0, 2)).toEqual([{ x: 21.5, y: 41.5 }, { x: 21.5, y: 39.5 }])
    expect(legs[1]).toMatchObject({ from: 0, to: 1 })
    expect(legs[5]).toMatchObject({ from: 1, to: 0 })
    // Each leg starts where the previous one ended.
    for (let i = 1; i < legs.length; i++) {
      const end = positionOnLeg(legs[i - 1]!, 1e9)
      const start = positionOnLeg(legs[i]!, 0)
      expect([start.x, start.y, start.floor]).toEqual([end.x, end.y, end.floor])
    }
    building.removeCore(building.cores()[0]!.id)
    expect(planVisit(analysis, office, 5)).toBeNull()
  })

  test('a street-floor room needs no core', () => {
    const building = starterBuilding()
    const analysis = new BuildingAnalysis(building)
    const shop = building.allRooms().find((room) => room.use === 'shop')!
    expect(planVisit(analysis, shop, 3)!.map((leg) => leg.kind)).toEqual(['walk', 'dwell', 'walk'])
  })
})

describe('crowd', () => {
  test('is deterministic per seed, capped by room count, and visitors leave when done', () => {
    const run = () => {
      const analysis = new BuildingAnalysis(starterBuilding())
      const crowd = new Crowd(7)
      const samples: string[] = []
      let peak = 0
      for (let frame = 0; frame < 1200; frame++) {
        crowd.step(analysis, 1 / 20)
        peak = Math.max(peak, crowd.visitors.length)
        if (frame % 200 === 0) samples.push(crowd.visitors.map((v) => `${v.id}@${v.x.toFixed(2)},${v.y.toFixed(2)},${v.floor.toFixed(2)}`).join(' '))
      }
      return { samples, peak, ids: crowd.visitors.map((visitor) => visitor.id) }
    }
    const first = run()
    expect(run()).toEqual(first)
    expect(first.peak).toBe(Crowd.capacityFor(4))
    expect(Math.min(...first.ids)).toBeGreaterThan(1)
  })
})

describe('storefront visits', () => {
  test('walk from the pavement across the lot straight in, with no lobby or core', () => {
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 6 * 4 }, (_, i) => ({ x: 4 + (i % 6), y: 32 + Math.floor(i / 6) })))
    expect(building.placeRoom('shop', 0, 5, 33, 'south')).toEqual({ ok: true })
    const shop = building.room(1)!
    const legs = planVisit(new BuildingAnalysis(building), shop, 4)!
    expect(legs.map((leg) => leg.kind)).toEqual(['walk', 'dwell', 'walk'])
    const outbound = legs[0]!.kind === 'walk' ? legs[0]!.points : []
    expect(outbound[0]).toEqual({ x: 6.5, y: 41.5 })
    expect(outbound.slice(-2)).toEqual([{ x: 6.5, y: 35.5 }, { x: 6.5, y: 34.5 }])
    building.paintPlate(0, Array.from({ length: 40 }, (_, x) => ({ x, y: 37 })))
    expect(planVisit(new BuildingAnalysis(building), shop, 4)).toBeNull()
  })
})

describe('elevator cars', () => {
  /** A four-floor slab with a corridor on every floor along y=39, a two-car core, and an office on each upper floor. */
  function tower() {
    const building = new Building()
    for (let floor = 0; floor <= 3; floor++) {
      building.paintPlate(floor, Array.from({ length: 20 * 10 }, (_, i) => ({ x: 10 + (i % 20), y: 30 + Math.floor(i / 20) })))
      building.paintCorridor(floor, Array.from({ length: 20 }, (_, x) => ({ x: 10 + x, y: 39 })))
    }
    expect(building.placeCore(0, 12, 37, 2)).toEqual({ ok: true })
    for (let floor = 1; floor <= 3; floor++) expect(building.placeRoom('office', floor, 20, 34, 'south')).toEqual({ ok: true })
    return building
  }

  test('a ride waits in the hall in front of a car and names the core it rides', () => {
    const building = tower()
    const core = building.cores()[0]!
    const legs = planVisit(new BuildingAnalysis(building), building.roomsOn(3)[0]!, 4)!
    const ride = legs.find((leg) => leg.kind === 'ride')!
    expect(ride).toMatchObject({ coreId: core.id, from: 0, to: 3 })
    const hall = hallTile(core, ride.kind === 'ride' ? ride.car : 0)
    expect(ride).toMatchObject({ x: hall.x + 0.5, y: hall.y + 0.5 })
    expect(hall.y).toBe(core.y + 1)
  })

  test('cars carry riders up and back, never over capacity, and record their waits', () => {
    const building = tower()
    const analysis = new BuildingAnalysis(building)
    const crowd = new Crowd(3)
    const core = building.cores()[0]!
    expect(crowd.averageWait(core.id)).toBeNull()
    let rode = false
    let upstairs = false
    for (let frame = 0; frame < 2400; frame++) {
      crowd.step(analysis, 1 / 20)
      const cars = crowd.cars()
      expect(cars).toHaveLength(2)
      for (const car of cars) {
        expect(car.riders.length).toBeLessThanOrEqual(CAR_CAPACITY)
        if (car.riders.length > 0) rode = true
        // Riders move with their car.
        for (const rider of car.riders) expect(rider.floor).toBe(car.floor)
      }
      if (crowd.visitors.some((visitor) => visitor.floor >= 2.5 && visitor.ride === undefined)) upstairs = true
    }
    expect(rode).toBe(true)
    expect(upstairs).toBe(true)
    expect(crowd.averageWait(core.id)).toBeGreaterThanOrEqual(0)
  })

  test('any change to a core sends home every visitor with a ride still ahead on it', () => {
    const edits: [string, (building: ReturnType<typeof tower>, id: string) => unknown][] = [
      ['removing it', (building, id) => building.removeCore(id)],
      ['shortening it', (building, id) => building.resizeCore(id, 0, 1)],
      ['adding a car', (building, id) => building.setCoreCars(id, 3)],
    ]
    for (const [edit, change] of edits) {
      const building = tower()
      const analysis = new BuildingAnalysis(building)
      const crowd = new Crowd(3)
      const id = building.cores()[0]!.id
      // Run until someone is aboard a car and someone else is still on the way to one.
      const aboard = () => crowd.visitors.some((visitor) => visitor.ride?.state === 'riding')
      const ahead = () => crowd.visitors.some((visitor) => !visitor.ride && visitor.legs.slice(visitor.leg).some((leg) => leg.kind === 'ride'))
      for (let frame = 0; frame < 4000 && !(aboard() && ahead()); frame++) crowd.step(analysis, 1 / 20)
      expect([edit, aboard() && ahead()]).toEqual([edit, true])
      const planned = new Set(crowd.visitors
        .filter((visitor) => visitor.legs.slice(visitor.leg).some((leg) => leg.kind === 'ride' && leg.coreId === id))
        .map((visitor) => visitor.id))
      change(building, id)
      crowd.step(analysis, 1 / 20)
      const stranded = crowd.visitors.filter((visitor) => planned.has(visitor.id))
      expect([edit, stranded.length]).toEqual([edit, 0])
      // Cars never carry anyone past the core's floors.
      for (let frame = 0; frame < 600; frame++) {
        crowd.step(analysis, 1 / 20)
        const core = building.core(id)
        for (const car of crowd.cars()) if (core) expect(car.floor).toBeLessThanOrEqual(core.topFloor)
      }
    }
  })

  test('removing the second core of a transfer takes riders of the first out of its car too', () => {
    // Floors 0–4 with a corridor on each; a low-rise core serves 0–2 and a high-rise core 2–4.
    const building = new Building()
    for (let floor = 0; floor <= 4; floor++) {
      building.paintPlate(floor, Array.from({ length: 12 * 8 }, (_, i) => ({ x: 10 + (i % 12), y: 32 + Math.floor(i / 12) })))
      building.paintCorridor(floor, Array.from({ length: 12 }, (_, x) => ({ x: 10 + x, y: 39 })))
    }
    building.placeCore(2, 12, 37)
    building.resizeCore('core-1', 0, 2)
    building.placeCore(2, 18, 37)
    building.resizeCore('core-2', 2, 4)
    expect(building.placeRoom('office', 4, 14, 34, 'south')).toEqual({ ok: true })
    const analysis = new BuildingAnalysis(building)
    const crowd = new Crowd(5)
    const transferring = () => crowd.visitors.find((visitor) => visitor.ride?.state === 'riding'
      && visitor.legs[visitor.leg]!.kind === 'ride' && (visitor.legs[visitor.leg] as { coreId: string }).coreId === 'core-1'
      && visitor.legs.slice(visitor.leg + 1).some((leg) => leg.kind === 'ride' && leg.coreId === 'core-2'))
    for (let frame = 0; frame < 4000 && !transferring(); frame++) crowd.step(analysis, 1 / 20)
    const rider = transferring()!
    expect(rider).toBeDefined()
    building.removeCore('core-2')
    for (let frame = 0; frame < 400; frame++) crowd.step(analysis, 1 / 20)
    expect(crowd.visitors).not.toContain(rider)
    for (const car of crowd.cars()) expect(car.riders).not.toContain(rider)
  })

  test('reshaping a core rebuilds its cars and sends its waiting and riding visitors home', () => {
    const building = tower()
    const analysis = new BuildingAnalysis(building)
    const crowd = new Crowd(3)
    const core = building.cores()[0]!
    for (let frame = 0; frame < 400 && !crowd.visitors.some((visitor) => visitor.ride); frame++) crowd.step(analysis, 1 / 20)
    expect(crowd.visitors.some((visitor) => visitor.ride)).toBe(true)
    expect(building.setCoreCars(core.id, 3)).toEqual({ ok: true })
    crowd.step(analysis, 1 / 20)
    expect(crowd.cars()).toHaveLength(3)
    expect(crowd.visitors.some((visitor) => visitor.ride)).toBe(false)
    expect(crowd.waiting(core.id)).toBe(0)
  })
})
