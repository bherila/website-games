import { BuildingAnalysis } from '../analysis'
import { starterBuilding } from '../building'
import { Crowd, planVisit, positionOnLeg } from '../people'

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
