import { BuildingAnalysis } from '../engine/analysis'
import { Building, SITE_DEPTH, starterBuilding } from '../engine/building'
import type { PlateTile } from '../engine/floorPlate'
import { TUTORIAL, tutorialProgress } from '../tutorial'

function rect(x: number, y: number, width: number, depth: number): PlateTile[] {
  return Array.from({ length: width * depth }, (_, i) => ({ x: x + (i % width), y: y + Math.floor(i / width) }))
}

describe('tutorial', () => {
  test('each step finishes on the state of the building, in order, following its guides', () => {
    const building = new Building()
    const analysis = new BuildingAnalysis(building)
    const progress = () => TUTORIAL[tutorialProgress(building, analysis)]?.id ?? 'done'
    const top = SITE_DEPTH - 12
    expect(progress()).toBe('plate')

    const block = TUTORIAL[0]!.guide!
    expect(building.paintPlate(0, rect(block.x, block.y, block.width, block.depth)).ok).toBe(true)
    expect(progress()).toBe('corridor')
    // A corridor that stops short of the street edge is not yet an entrance.
    building.paintCorridor(0, rect(20, top + 2, 1, 6))
    expect(progress()).toBe('corridor')
    const lane = TUTORIAL[1]!.guide!
    building.paintCorridor(0, rect(lane.x, lane.y, lane.width, lane.depth))
    expect(progress()).toBe('core')

    expect(building.placeCore(0, 21, top + 3).ok).toBe(true)
    expect(progress()).toBe('storefront')
    // An inside shop does not count; one on the street edge facing out does.
    expect(building.placeRoom('shop', 0, 17, top + 5, 'east').ok).toBe(true)
    expect(progress()).toBe('storefront')
    expect(building.placeRoom('shop', 0, 13, top + 9, 'south').ok).toBe(true)
    expect(progress()).toBe('cafe')
    expect(building.placeRoom('cafe', 0, 21, top + 6, 'west').ok).toBe(true)
    expect(progress()).toBe('upstairs')

    expect(building.inheritFloorBelow(1).ok).toBe(true)
    expect(progress()).toBe('raise-core')
    const core = building.cores()[0]!
    expect(building.resizeCore(core.id, 0, 1).ok).toBe(true)
    expect(progress()).toBe('corridor-up')
    // A corridor away from the core is not served yet.
    building.paintCorridor(1, rect(13, top + 1, 4, 1))
    expect(progress()).toBe('corridor-up')
    building.paintCorridor(1, rect(13, top + 5, 9, 1))
    expect(progress()).toBe('office')
    expect(building.placeRoom('office', 1, 13, top + 6, 'north').ok).toBe(true)
    expect(progress()).toBe('done')
    expect(tutorialProgress(building, analysis)).toBe(TUTORIAL.length)
  })

  test('the example block already passes every step but the storefront', () => {
    const building = starterBuilding()
    expect(TUTORIAL[tutorialProgress(building, new BuildingAnalysis(building))]!.id).toBe('storefront')
  })

  test('every step names a tool and a floor, and guides sit on the site', () => {
    for (const step of TUTORIAL) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
      if (step.guide) {
        expect(step.guide.x + step.guide.width).toBeLessThanOrEqual(40)
        expect(step.guide.y + step.guide.depth).toBeLessThanOrEqual(SITE_DEPTH)
      }
    }
  })
})
