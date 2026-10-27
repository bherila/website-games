import { FloorPlateModel, type PlateTile, type VerticalFootprint } from '../floorPlate'

function rectangle(x: number, y: number, width: number, depth: number): PlateTile[] {
  return Array.from({ length: width * depth }, (_, index) => ({ x: x + index % width, y: y + Math.floor(index / width) }))
}

function area(model: FloorPlateModel, floor: number): number {
  return model.getPlate(floor).reduce((sum, tile) => sum + tile, 0)
}

function vertical(overrides: Partial<VerticalFootprint> = {}): VerticalFootprint {
  return { id: 'upper-core', kind: 'core', x: 2, y: 3, width: 2, depth: 2, bottomFloor: 15, topFloor: 30, ...overrides }
}

describe('floor plates', () => {
  test('defaults to 40×40, accepts rectangular grids and owns its typed-array masks', () => {
    expect(new FloorPlateModel().getPlate(0)).toEqual(new Uint8Array(1600))
    const model = new FloorPlateModel({ width: 5, depth: 3 })
    model.paint(-2, [{ x: 0, y: 0 }, { x: 4, y: 2 }])
    const expected = new Uint8Array(15)
    expected[0] = 1
    expected[14] = 1
    expect(model.getPlate(-2)).toEqual(expected)
    const copy = model.getPlate(-2)
    copy.fill(0)
    expect(model.hasPlate(-2, { x: 4, y: 2 })).toBe(true)
    expect(model.floorNumbers()).toEqual([-2])
  })

  test('painting and erasing a selection validate every tile before committing', () => {
    const model = new FloorPlateModel({ width: 4, depth: 3 })
    model.paint(0, rectangle(0, 0, 2, 2))
    const before = model.getPlate(0)
    expect(() => model.paint(0, [{ x: 3, y: 2 }, { x: 4, y: 2 }])).toThrow('outside')
    expect(model.getPlate(0)).toEqual(before)
    expect(() => model.erase(0, [{ x: 0, y: 0 }, { x: -1, y: 0 }])).toThrow('outside')
    expect(model.getPlate(0)).toEqual(before)
    model.erase(0, [{ x: 0, y: 0 }])
    expect(area(model, 0)).toBe(3)
    expect(model.hasPlate(0, { x: 0, y: 0 })).toBe(false)
    expect(() => model.hasPlate(99, { x: 4, y: 0 })).toThrow('outside')
  })

  test('inherit copies only the shell and permits independent setbacks', () => {
    const model = new FloorPlateModel({ width: 7, depth: 5 })
    model.paint(3, rectangle(1, 1, 4, 3))
    model.inheritFloorBelow(4)
    expect(model.getPlate(4)).toEqual(model.getPlate(3))
    model.erase(4, rectangle(3, 1, 2, 3))
    expect(area(model, 3)).toBe(12)
    expect(area(model, 4)).toBe(6)
    expect(model.overhangCount(4)).toBe(0)
    model.paint(3, [{ x: 5, y: 4 }])
    expect(model.hasPlate(4, { x: 5, y: 4 })).toBe(false)
  })

  test('inheriting an absent floor clears only the destination shell', () => {
    const model = new FloorPlateModel({ width: 3, depth: 2 })
    model.paint(5, rectangle(0, 0, 3, 2))
    model.inheritFloorBelow(5)
    expect(area(model, 5)).toBe(0)
    expect(model.floorNumbers()).toEqual([])
  })

  test('an atrium cuts one hole through the inclusive range without touching other floors', () => {
    const model = new FloorPlateModel({ width: 6, depth: 5 })
    for (const floor of [-1, 0, 1, 2, 3]) model.paint(floor, rectangle(0, 0, 6, 5))
    model.carveAtrium(0, 2, rectangle(2, 1, 2, 2))
    for (const floor of [0, 1, 2]) {
      expect(area(model, floor)).toBe(26)
      expect(model.hasPlate(floor, { x: 2, y: 1 })).toBe(false)
    }
    expect(area(model, -1)).toBe(30)
    expect(area(model, 3)).toBe(30)
    model.carveAtrium(10, 100, [{ x: 0, y: 0 }])
    expect(model.floorNumbers()).toEqual([-1, 0, 1, 2, 3])
  })

  test('counts overhang tiles against only the immediate lower plate, without structural restrictions', () => {
    const model = new FloorPlateModel({ width: 6, depth: 4 })
    model.paint(10, rectangle(0, 0, 2, 2))
    model.inheritFloorBelow(11)
    model.paint(11, [{ x: 2, y: 0 }, { x: 2, y: 1 }])
    expect(model.overhangCount(11)).toBe(2)
    model.erase(10, [{ x: 1, y: 1 }])
    expect(model.overhangCount(11)).toBe(3)
    expect(model.overhangCount(10)).toBe(3)
    expect(model.overhangCount(12)).toBe(0)
  })

  test('selection order and duplicate tiles do not change the resulting mask', () => {
    const first = new FloorPlateModel({ width: 8, depth: 5 })
    const second = new FloorPlateModel({ width: 8, depth: 5 })
    const tiles = rectangle(1, 1, 5, 3)
    first.paint(2, tiles)
    second.paint(2, [...tiles].reverse().concat(tiles))
    first.carveAtrium(2, 2, [{ x: 2, y: 2 }, { x: 4, y: 2 }])
    second.carveAtrium(2, 2, [{ x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 }])
    expect(second.getPlate(2)).toEqual(first.getPlate(2))
  })
})

describe('explicit vertical footprints', () => {
  test('a core from floor 15 to 30 needs plate in its range and one plant/utility tile on 14, not a shaft below', () => {
    const model = new FloorPlateModel({ width: 9, depth: 7 })
    for (let floor = 15; floor <= 30; floor++) model.paint(floor, rectangle(2, 3, 2, 2))
    model.paint(14, [{ x: 2, y: 3 }])
    model.setUtilityTile(14, { x: 2, y: 3 })
    model.placeVerticalFootprint(vertical())
    expect(model.verticalFootprintsAt(15)).toEqual([vertical()])
    expect(model.verticalFootprintsAt(30)).toEqual([vertical()])
    expect(model.verticalFootprintsAt(14)).toEqual([])
    expect(model.verticalFootprintsAt(31)).toEqual([])
    for (let floor = 0; floor < 14; floor++) expect(area(model, floor)).toBe(0)
    expect(model.overhangCount(15)).toBe(3)
  })

  test('a plant on the wrong floor or outside the core footprint cannot supply its machine tile', () => {
    const model = new FloorPlateModel({ width: 8, depth: 8 })
    for (let floor = 13; floor <= 16; floor++) model.paint(floor, rectangle(0, 0, 8, 8))
    const core = vertical({ topFloor: 16 })
    expect(() => model.placeVerticalFootprint(core)).toThrow('floor 14')
    model.setUtilityTile(13, { x: 2, y: 3 })
    model.setUtilityTile(14, { x: 7, y: 7 })
    expect(() => model.placeVerticalFootprint(core)).toThrow('floor 14')
    expect(model.verticalFootprintsAt(15)).toEqual([])
    model.setUtilityTile(14, { x: 3, y: 4 })
    expect(() => model.placeVerticalFootprint(core)).not.toThrow()
  })

  test('checks every cell on every floor in the core range before placement', () => {
    const model = new FloorPlateModel({ width: 8, depth: 8 })
    for (let floor = 14; floor <= 30; floor++) model.paint(floor, rectangle(2, 3, 2, 2))
    model.setUtilityTile(14, { x: 2, y: 3 })
    model.erase(23, [{ x: 3, y: 4 }])
    expect(() => model.placeVerticalFootprint(vertical())).toThrow('floor 23')
    expect(model.verticalFootprintsAt(15)).toEqual([])
    model.paint(23, [{ x: 3, y: 4 }])
    expect(() => model.placeVerticalFootprint(vertical())).not.toThrow()
  })

  test('inheritance never copies utility tiles or extends cores, risers or exit stairs', () => {
    const model = new FloorPlateModel({ width: 6, depth: 5 })
    for (const floor of [-1, 0, 1]) model.paint(floor, rectangle(0, 0, 6, 5))
    model.setUtilityTile(-1, { x: 0, y: 0 })
    model.setUtilityTile(1, { x: 4, y: 4 })
    for (const [index, kind] of (['core', 'riser', 'exit-stair'] as const).entries()) {
      model.placeVerticalFootprint(vertical({ id: kind, kind, x: index, y: 0, width: 1, depth: 1, bottomFloor: 0, topFloor: 1 }))
    }
    model.inheritFloorBelow(2)
    expect(model.getPlate(2)).toEqual(model.getPlate(1))
    expect(model.verticalFootprintsAt(1).map((footprint) => footprint.kind)).toEqual(['core', 'riser', 'exit-stair'])
    expect(model.verticalFootprintsAt(2)).toEqual([])
    expect(model.getUtilityTiles(2).some(Boolean)).toBe(false)
    expect(model.getUtilityTiles(1)[28]).toBe(1)
  })

  test('plate erases and inheritance cannot strand explicitly placed infrastructure', () => {
    const model = new FloorPlateModel({ width: 5, depth: 5 })
    model.paint(1, [{ x: 4, y: 4 }])
    model.paint(2, rectangle(0, 0, 5, 5))
    model.placeVerticalFootprint(vertical({ id: 'stair', kind: 'exit-stair', x: 1, y: 1, width: 2, depth: 2, bottomFloor: 2, topFloor: 2 }))
    const before = model.getPlate(2)
    expect(() => model.erase(2, [{ x: 4, y: 0 }, { x: 2, y: 2 }])).toThrow('stair')
    expect(model.getPlate(2)).toEqual(before)
    expect(() => model.inheritFloorBelow(2)).toThrow('stair')
    expect(model.getPlate(2)).toEqual(before)
  })

  test('a blocked atrium cut is atomic across all floors', () => {
    const model = new FloorPlateModel({ width: 5, depth: 5 })
    for (const floor of [1, 2, 3]) model.paint(floor, rectangle(0, 0, 5, 5))
    model.placeVerticalFootprint(vertical({ id: 'riser', kind: 'riser', x: 2, y: 2, width: 1, depth: 1, bottomFloor: 2, topFloor: 3 }))
    expect(() => model.carveAtrium(1, 3, [{ x: 2, y: 2 }])).toThrow('floor 2')
    for (const floor of [1, 2, 3]) expect(area(model, floor)).toBe(25)
  })

  test('a core keeps its plant tile until another one exists or the core is removed', () => {
    const model = new FloorPlateModel({ width: 6, depth: 6 })
    for (const floor of [14, 15]) model.paint(floor, rectangle(2, 3, 2, 2))
    model.setUtilityTile(14, { x: 2, y: 3 })
    model.placeVerticalFootprint(vertical({ topFloor: 15 }))
    expect(() => model.setUtilityTile(14, { x: 2, y: 3 }, false)).toThrow('floor 14')
    expect(() => model.erase(14, [{ x: 2, y: 3 }])).toThrow('utility tiles')
    model.setUtilityTile(14, { x: 3, y: 4 })
    model.setUtilityTile(14, { x: 2, y: 3 }, false)
    expect(model.getUtilityTiles(14)[20]).toBe(0)
    expect(model.removeVerticalFootprint('upper-core')).toBe(true)
    expect(model.removeVerticalFootprint('upper-core')).toBe(false)
    model.setUtilityTile(14, { x: 3, y: 4 }, false)
    expect(() => model.erase(14, rectangle(2, 3, 2, 2))).not.toThrow()
  })

  test('callers cannot move stored footprints by changing their input or returned objects', () => {
    const model = new FloorPlateModel({ width: 4, depth: 3 })
    model.paint(0, rectangle(0, 0, 4, 3))
    const input = vertical({ id: 'riser', kind: 'riser', x: 1, y: 1, width: 1, depth: 1, bottomFloor: 0, topFloor: 0 })
    model.placeVerticalFootprint(input)
    input.x = 3
    model.verticalFootprintsAt(0)[0]!.x = 2
    expect(model.verticalFootprintsAt(0)[0]!.x).toBe(1)
    expect(() => model.placeVerticalFootprint(input)).toThrow('already exists')
  })
})

describe('invalid floor-plate inputs', () => {
  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid grid dimensions %s', (width) => {
    expect(() => new FloorPlateModel({ width })).toThrow(RangeError)
    expect(() => new FloorPlateModel({ depth: width })).toThrow(RangeError)
  })

  test('rejects bad ranges, fractions and out-of-bounds footprints without modifying the model', () => {
    const model = new FloorPlateModel({ width: 3, depth: 2 })
    model.paint(0, rectangle(0, 0, 3, 2))
    expect(() => model.carveAtrium(2, 1, [])).toThrow('Bottom')
    expect(() => model.paint(0.5, [])).toThrow('Floor')
    expect(() => model.paint(0, [{ x: 0.5, y: 1 }])).toThrow('outside')
    expect(() => model.placeVerticalFootprint(vertical({ kind: 'riser', x: 2, y: 0, width: 2, depth: 1, bottomFloor: 0, topFloor: 0 }))).toThrow('outside')
    expect(() => model.placeVerticalFootprint(vertical({ kind: 'riser', x: 0, y: 0, width: 1, depth: 1, bottomFloor: 1, topFloor: 0 }))).toThrow('Bottom')
    expect(() => model.setUtilityTile(1, { x: 0, y: 0 })).toThrow('needs a floor plate')
    expect(model.floorNumbers()).toEqual([0])
    expect(area(model, 0)).toBe(6)
    expect(model.verticalFootprintsAt(0)).toEqual([])
  })
})
