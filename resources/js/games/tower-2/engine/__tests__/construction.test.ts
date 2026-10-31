import { Building, type EditResult,encodeMask } from '../building'
import { floorConstruction, formatCost } from '../construction'
import type { PlateTile } from '../floorPlate'

function row(x: number, length: number, y = 10): PlateTile[] {
  return Array.from({ length }, (_, i) => ({ x: x + i, y }))
}

function must(result: EditResult): void {
  expect(result).toEqual({ ok: true })
}

function cantilever(): Building {
  const building = new Building()
  must(building.paintPlate(0, row(10, 2)))
  must(building.paintPlate(1, row(10, 5)))
  return building
}

describe('shell reach and estimates', () => {
  test('three unsupported tiles are allowed; a fourth refuses the entire edit without changing saves or revision', () => {
    const building = cantilever()
    expect(building.construction(1)).toMatchObject({ area: 5, overhang: 3, outOfReach: 0, maxReach: 3, premium: 660, cost: 1210 })
    must(building.paintPlate(0, [{ x: 10, y: 11 }]))
    const before = building.snapshot()
    const revision = building.revision
    // One supported and one illegal tile: no partial paint.
    const tiles = [{ x: 10, y: 11 }, { x: 15, y: 10 }]
    expect(building.paintPlate(1, tiles)).toMatchObject({ ok: false, reason: expect.stringContaining('within 3 tiles') })
    expect(building.snapshot()).toEqual(before)
    expect(building.revision).toBe(revision)
  })

  test('diagonal contact, disconnected islands and a missing floor below do not support new plate', () => {
    const building = new Building()
    must(building.paintPlate(0, row(10, 1)))
    must(building.paintPlate(1, row(10, 1)))
    for (const tile of [{ x: 11, y: 11 }, { x: 12, y: 10 }, { x: 39, y: 10 }]) {
      expect(building.paintPlate(1, [tile]).ok).toBe(false)
    }
    expect(building.paintPlate(3, row(10, 1)).ok).toBe(false)
    // A connected two-step corner works; the rule is not a diagonal radius.
    must(building.paintPlate(1, [{ x: 11, y: 10 }, { x: 11, y: 11 }]))
    expect(building.construction(1).maxReach).toBe(2)
  })

  test('flood fill uses the nearest support, respects holes and never wraps across grid rows', () => {
    const plate = new Uint8Array(15).fill(1)
    const below = new Uint8Array(15)
    below[0] = 1
    below[14] = 1
    const plan = floorConstruction(plate, below, 5, 2)
    expect([...plan.distances]).toEqual([0, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 0])
    const edge = new Uint8Array(15)
    edge[4] = 1
    edge[5] = 1
    const support = new Uint8Array(15)
    support[4] = 1
    expect(floorConstruction(edge, support, 5, 1).distances[5]).toBe(Infinity)
    const hole = new Uint8Array([1, 0, 1])
    expect(floorConstruction(hole, new Uint8Array([1, 0, 0]), 3, 1).distances[2]).toBe(Infinity)
  })

  test('ground and basement plates are exempt; area and height price every tile and paint quotes only the difference', () => {
    const building = new Building()
    must(building.paintPlate(-3, row(0, 2)))
    must(building.paintPlate(0, row(0, 2)))
    expect(building.construction(-3)).toMatchObject({ cost: 260, overhang: 0, maxReach: 0 })
    expect(building.construction(0)).toMatchObject({ cost: 200, overhang: 0, maxReach: 0 })
    expect(building.checkPlateEdit('paint', 1, row(0, 5))).toEqual({ ok: true, added: 5, overhangAdded: 3, costDelta: 1210 })
    must(building.paintPlate(1, row(0, 5)))
    expect(building.checkPlateEdit('paint', 1, [...row(0, 5), ...row(0, 5)])).toEqual({ ok: true, added: 0, overhangAdded: 0, costDelta: 0 })
    expect(formatCost(12340)).toBe('$12,340')
  })

  test('adding support below reprices existing plate above, and a no-op preview never mutates the building', () => {
    const building = cantilever()
    const before = building.snapshot()
    const revision = building.revision
    expect(building.checkPlateEdit('paint', 0, row(12, 1))).toMatchObject({ ok: true, costDelta: -120, added: 1 })
    expect(building.snapshot()).toEqual(before)
    expect(building.revision).toBe(revision)
    must(building.paintPlate(0, row(12, 1)))
    expect(building.construction(1)).toMatchObject({ overhang: 2, maxReach: 2, cost: 990 })
  })
})

describe('edits to support', () => {
  test('erasing support refuses before deleting rooms or corridors, and succeeds once the overhang is trimmed', () => {
    const building = new Building()
    must(building.paintPlate(0, Array.from({ length: 9 }, (_, i) => ({ x: 10 + i % 3, y: 10 + Math.floor(i / 3) }))))
    must(building.placeRoom('shop', 0, 10, 10, 'south'))
    must(building.paintPlate(1, row(10, 6)))
    const before = building.snapshot()
    const revision = building.revision
    expect(building.erase(0, [{ x: 12, y: 10 }])).toMatchObject({ ok: false, reason: expect.stringContaining('Floor 1') })
    expect(building.snapshot()).toEqual(before)
    expect(building.revision).toBe(revision)
    must(building.erase(1, row(15, 1)))
    must(building.erase(0, [{ x: 12, y: 10 }]))
    expect(building.allRooms()).toHaveLength(0)
  })

  test('an atrium cuts all floors together, but cannot sever a cantilever from its supported tiles', () => {
    const building = cantilever()
    expect(building.carveAtrium(1, row(12, 1)).ok).toBe(false)
    const before = building.snapshot()
    expect(building.carveAtrium(0, row(11, 1)).ok).toBe(false)
    expect(building.snapshot()).toEqual(before)
    must(building.carveAtrium(0, row(10, 5)))
    expect(building.builtFloors()).toEqual([])
  })

  test('copying a smaller outline cannot strand a floor above, and copying preserves supported contents', () => {
    const building = new Building()
    must(building.paintPlate(0, row(10, 1)))
    must(building.paintPlate(1, row(10, 4)))
    must(building.paintPlate(2, row(10, 7)))
    must(building.paintCorridor(1, row(10, 1)))
    const before = building.snapshot()
    expect(building.checkPlateEdit('inherit', 1)).toMatchObject({ ok: false, reason: expect.stringContaining('Floor 2') })
    expect(building.inheritFloorBelow(1).ok).toBe(false)
    expect(building.snapshot()).toEqual(before)
    must(building.erase(2, row(14, 3)))
    must(building.inheritFloorBelow(1))
    expect(building.tileUse(1, 10, 10)).toBe('corridor')
    expect(Building.fromSnapshot(building.snapshot()).snapshot()).toEqual(building.snapshot())
  })

  test('legacy unsupported layouts survive load and undo snapshots, permit repairs and unrelated edits, but forbid new violations', () => {
    // Before reach rules, prototypes could paint a disconnected upper floor without any ground plate.
    const snapshot = new Building().snapshot()
    snapshot.plates.plates = [{ floor: 1, mask: encodeMask(row(10, 5).map(({ x, y }) => y * 40 + x), 1600) }]
    const building = Building.fromSnapshot(snapshot)
    expect(building.snapshot()).toEqual(snapshot)
    expect(building.construction(1)).toMatchObject({ outOfReach: 5, maxReach: Infinity })
    must(building.paintPlate(0, row(30, 1)))
    expect(building.paintPlate(1, row(15, 1)).ok).toBe(false)
    // Adding support repairs part of the floor; removing it again would worsen the finite overreach.
    must(building.paintPlate(0, row(10, 1)))
    expect(building.construction(1)).toMatchObject({ outOfReach: 1, maxReach: 4 })
    const repaired = building.snapshot()
    expect(building.erase(0, row(10, 1)).ok).toBe(false)
    must(building.erase(1, row(14, 1)))
    expect(building.construction(1).outOfReach).toBe(0)
    expect(Building.fromSnapshot(repaired).snapshot()).toEqual(repaired)
  })
})
