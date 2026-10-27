import { createIsoProjection, floorVisibility, type QuarterTurn } from '../isoProjection'

const rotations: QuarterTurn[] = [0, 1, 2, 3]

describe('isometric projection', () => {
  it('uses equal foreshortening for the three world axes and screen y points down', () => {
    const projection = createIsoProjection()
    const x = projection.tileToScreen({ x: 1, y: 0, floor: 0 })
    const y = projection.tileToScreen({ x: 0, y: 1, floor: 0 })
    const z = projection.tileToScreen({ x: 0, y: 0, floor: 1 })
    expect(x.x).toBeCloseTo(1 / Math.sqrt(2))
    expect(y.x).toBeCloseTo(-1 / Math.sqrt(2))
    expect(x.y).toBeCloseTo(1 / Math.sqrt(6))
    expect(y.y).toBeCloseTo(x.y)
    expect(z).toEqual({ x: 0, y: -Math.sqrt(2 / 3) })
    for (const axis of [x, y, z]) expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(Math.sqrt(2 / 3))
  })

  it.each(rotations)('rotates the world about its origin by quarter-turn %i', rotation => {
    const expected = [
      { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(6) },
      { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(6) },
      { x: -1 / Math.sqrt(2), y: -1 / Math.sqrt(6) },
      { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(6) },
    ][rotation]!
    const screen = createIsoProjection({ rotation }).tileToScreen({ x: 1, y: 0, floor: 0 })
    expect(screen.x).toBeCloseTo(expected.x)
    expect(screen.y).toBeCloseTo(expected.y)
  })

  describe.each(rotations)('quarter-turn %i', rotation => {
    it.each([0.125, 1, 3.75, 20])('round-trips continuous positions at zoom %f across floors', zoom => {
      const projection = createIsoProjection({ rotation, zoom, tileSize: 17, floorHeight: 29, origin: { x: 375, y: 812 } })
      for (const floor of [-8, 0, 15, 73]) {
        for (const point of [{ x: -11.75, y: 27.5, floor }, { x: 0, y: 0, floor }, { x: 3.5, y: -4.25, floor }]) {
          const hit = projection.screenToFloor(projection.tileToScreen(point), floor)
          expect(hit.x).toBeCloseTo(point.x, 10)
          expect(hit.y).toBeCloseTo(point.y, 10)
          expect(hit.floor).toBe(floor)
          expect(projection.screenToTile(projection.tileToScreen(point), floor)).toEqual({
            x: Math.floor(point.x), y: Math.floor(point.y), floor,
          })
        }
      }
    })

    it('picks the world half-open tile on exact edges and on either side, including negatives', () => {
      const projection = createIsoProjection({ rotation, zoom: 2.3, tileSize: 19, floorHeight: 31, origin: { x: 183.3, y: -77.7 } })
      for (const x of [-3, 0, 7]) {
        for (const y of [-5, 0, 9]) {
          for (const dx of [-1e-6, 0, 1e-6]) {
            for (const dy of [-1e-6, 0, 1e-6]) {
              const screen = projection.tileToScreen({ x: x + dx, y: y + dy, floor: -2 })
              expect(projection.screenToTile(screen, -2)).toEqual({
                x: x + (dx < 0 ? -1 : 0), y: y + (dy < 0 ? -1 : 0), floor: -2,
              })
            }
          }
        }
      }
    })

    it('intersects the selected floor instead of assuming the ground plane', () => {
      const projection = createIsoProjection({ rotation, tileSize: 2, floorHeight: 4 })
      const viewRaySteps = [{ x: 2, y: 2 }, { x: 2, y: -2 }, { x: -2, y: -2 }, { x: -2, y: 2 }]
      const screen = projection.tileToScreen({ x: 0, y: 0, floor: 0 })
      const hit = projection.screenToFloor(screen, 1)
      expect(hit.x).toBeCloseTo(viewRaySteps[rotation]!.x)
      expect(hit.y).toBeCloseTo(viewRaySteps[rotation]!.y)
      expect(hit.floor).toBe(1)
    })

    it('draws overlapping points far to near using height as well as horizontal depth', () => {
      const projection = createIsoProjection({ rotation, tileSize: 2, floorHeight: 4 })
      const viewRaySteps = [{ x: 2, y: 2 }, { x: 2, y: -2 }, { x: -2, y: -2 }, { x: -2, y: 2 }]
      const far = { x: 0, y: 0, floor: 0 }
      const near = { ...viewRaySteps[rotation]!, floor: 1 }
      const farScreen = projection.tileToScreen(far)
      const nearScreen = projection.tileToScreen(near)
      expect(nearScreen.x).toBeCloseTo(farScreen.x)
      expect(nearScreen.y).toBeCloseTo(farScreen.y)
      expect(projection.depthSortKey(near) - projection.depthSortKey(far)).toBeCloseTo(4 * Math.sqrt(3))
      const high = { x: 0, y: 0, floor: 1 }
      expect(projection.tileToScreen(high).y).toBeLessThan(farScreen.y)
      expect(projection.depthSortKey(high)).toBeGreaterThan(projection.depthSortKey(far))
    })

    it('bounds the entire non-square floor envelope with translation, scale and height', () => {
      const projection = createIsoProjection({ rotation, zoom: 2.5, tileSize: 13, floorHeight: 21, origin: { x: 100, y: -30 } })
      const rectangle = { x: -2, y: 4, floor: -3, width: 3, depth: 5 }
      const bounds = projection.floorBounds(rectangle)
      const centre = projection.tileToScreen({ x: -0.5, y: 6.5, floor: -3 })
      const expectedWidth = 8 * 13 * 2.5 / Math.sqrt(2)
      const expectedHeight = 8 * 13 * 2.5 / Math.sqrt(6)
      expect(bounds.width).toBeCloseTo(expectedWidth)
      expect(bounds.height).toBeCloseTo(expectedHeight)
      expect(bounds.minX).toBeCloseTo(centre.x - expectedWidth / 2)
      expect(bounds.maxX).toBeCloseTo(centre.x + expectedWidth / 2)
      expect(bounds.minY).toBeCloseTo(centre.y - expectedHeight / 2)
      expect(bounds.maxY).toBeCloseTo(centre.y + expectedHeight / 2)
      for (let x = -2; x <= 1; x += 1) {
        for (let y = 4; y <= 9; y += 1) {
          const point = projection.tileToScreen({ x, y, floor: -3 })
          expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-10)
          expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-10)
          expect(point.y).toBeGreaterThanOrEqual(bounds.minY - 1e-10)
          expect(point.y).toBeLessThanOrEqual(bounds.maxY + 1e-10)
        }
      }
    })
  })

  it('keeps camera depth independent of pan and zoom', () => {
    const point = { x: 4, y: 7, floor: 3 }
    const a = createIsoProjection({ rotation: 2, tileSize: 7, floorHeight: 9 })
    const b = createIsoProjection({ rotation: 2, tileSize: 7, floorHeight: 9, zoom: 100, origin: { x: 99, y: -30 } })
    expect(a.depthSortKey(point)).toBe(b.depthSortKey(point))
  })

  it('captures options and supports a degenerate floor envelope', () => {
    const origin = { x: 10, y: 20 }
    const projection = createIsoProjection({ origin })
    origin.x = 500
    expect(projection.floorBounds({ x: 0, y: 0, floor: 0, width: 0, depth: 0 })).toEqual({
      minX: 10, maxX: 10, minY: 20, maxY: 20, width: 0, height: 0,
    })
  })

  it('rejects singular camera scales and invalid envelopes', () => {
    for (const key of ['tileSize', 'floorHeight', 'zoom'] as const) {
      for (const value of [0, -1, NaN, Infinity]) expect(() => createIsoProjection({ [key]: value })).toThrow(RangeError)
    }
    expect(() => createIsoProjection({ rotation: 4 as QuarterTurn })).toThrow(RangeError)
    expect(() => createIsoProjection({ origin: { x: Infinity, y: 0 } })).toThrow(RangeError)
    const projection = createIsoProjection()
    for (const dimensions of [{ width: -1, depth: 2 }, { width: 2, depth: NaN }]) {
      expect(() => projection.floorBounds({ x: 0, y: 0, floor: 0, ...dimensions })).toThrow(RangeError)
    }
  })
})

describe('cutaway floor bands', () => {
  it('defaults to solid active, ghosted below and hidden above without assuming ground level', () => {
    expect(floorVisibility(-4, -4)).toBe('solid')
    expect(floorVisibility(-5, -4)).toBe('ghosted')
    expect(floorVisibility(-100, -4)).toBe('ghosted')
    expect(floorVisibility(-3, -4)).toBe('hidden')
  })

  it('uses independently configurable solid and ghost bands on both sides', () => {
    const bands = { solidBelow: 2, solidAbove: 1, ghostBelow: 1, ghostAbove: 2 }
    expect(Array.from({ length: 10 }, (_, index) => floorVisibility(index + 11, 15, bands))).toEqual([
      'hidden', 'ghosted', 'solid', 'solid', 'solid', 'solid', 'ghosted', 'ghosted', 'hidden', 'hidden',
    ])
  })

  it('allows zero bands and unbounded bands', () => {
    expect(floorVisibility(2, 3, { ghostBelow: 0 })).toBe('hidden')
    expect(floorVisibility(30, 3, { ghostAbove: Infinity })).toBe('ghosted')
    expect(floorVisibility(30, 3, { solidAbove: Infinity })).toBe('solid')
  })

  it('rejects invalid band counts and noninteger floors', () => {
    for (const key of ['solidBelow', 'solidAbove', 'ghostBelow', 'ghostAbove'] as const) {
      for (const value of [-1, -Infinity, 0.5, NaN]) {
        expect(() => floorVisibility(0, 0, { [key]: value })).toThrow(RangeError)
      }
    }
    expect(() => floorVisibility(0.5, 1)).toThrow(RangeError)
    expect(() => floorVisibility(1, Infinity)).toThrow(RangeError)
  })
})
