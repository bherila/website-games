import * as THREE from 'three'

import { Building, starterBuilding } from '../../engine/building'
import { buildFloorGeometry, buildGridGeometry, GLASS_HEIGHT, SILL_HEIGHT } from '../floorGeometry'
import { FLOOR_HEIGHT } from '../isoCamera'
import { PALETTE } from '../palette'

function hasColor(geometry: THREE.BufferGeometry, hex: number): boolean {
  const target = new THREE.Color(hex)
  const colors = geometry.getAttribute('color')
  for (let i = 0; i < colors.count; i++) {
    if (Math.abs(colors.getX(i) - target.r) < 1e-6 && Math.abs(colors.getY(i) - target.g) < 1e-6 && Math.abs(colors.getZ(i) - target.b) < 1e-6) return true
  }
  return false
}

describe('floor geometry', () => {
  test('an empty floor builds nothing', () => {
    expect(buildFloorGeometry(new Building(), 3, {})).toEqual({ solid: null, glass: null, signs: null })
  })

  test('a floor sits at its height with corridors, rooms, cores and floor-to-ceiling glass', () => {
    const building = starterBuilding()
    const { solid, glass } = buildFloorGeometry(building, 1, { selectedCoreId: 'core-1' })
    solid!.computeBoundingBox()
    glass!.computeBoundingBox()
    expect(solid!.boundingBox!.min.y).toBeCloseTo(FLOOR_HEIGHT - 0.16)
    expect(glass!.boundingBox!.max.y).toBeCloseTo(FLOOR_HEIGHT + GLASS_HEIGHT)
    expect(hasColor(solid!, PALETTE.mullion)).toBe(true)
    expect(hasColor(solid!, PALETTE.corridor)).toBe(true)
    expect(hasColor(solid!, PALETTE.select)).toBe(true)
    expect(hasColor(solid!, PALETTE.coreBand)).toBe(false)
    expect(hasColor(solid!, PALETTE.overhang)).toBe(false)
  })

  test('cantilevered plate is tinted, and merged runs keep the slab cheap', () => {
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })))
    building.paintPlate(1, Array.from({ length: 6 }, (_, x) => ({ x, y: 0 })))
    const { solid } = buildFloorGeometry(building, 1, {})
    expect(hasColor(solid!, PALETTE.overhang)).toBe(true)
    // Two slab runs have three texture-repeat tops and four side faces each;
    // 18 mullions round the 6×1 strip still have five visible faces each.
    expect(solid!.getAttribute('position').count).toBe((3 + 2 * 4 + 18 * 5) * 4)
  })

  test('the drawing grid covers the whole lot at the floor height', () => {
    const grid = buildGridGeometry(4, 3, 2)
    expect(grid.getAttribute('position').count).toBe((5 + 4) * 2)
    grid.computeBoundingBox()
    expect(grid.boundingBox!.min.y).toBeCloseTo(2 * FLOOR_HEIGHT + 0.005)
  })
})

/** Glass vertices within a tile's span along x, on the plate's south (street-side) face. */
function southGlass(glass: THREE.BufferGeometry, x: number, faceZ: number): number[] {
  const positions = glass.getAttribute('position')
  const heights: number[] = []
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) > x + 0.05 && positions.getX(i) < x + 0.95 && Math.abs(positions.getZ(i) - faceZ) < 0.1) heights.push(positions.getY(i))
  }
  return heights
}

describe('façade', () => {
  /** A 6×4 street-floor block on rows 30–33, with an entrance corridor down its middle. */
  function block(): Building {
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 24 }, (_, i) => ({ x: 4 + (i % 6), y: 30 + Math.floor(i / 6) })))
    return building
  }

  test('a cutaway lowers only the sides toward the camera', () => {
    const { glass } = buildFloorGeometry(block(), 0, { cutaway: ['south', 'east'] })
    const positions = glass!.getAttribute('position')
    let southTop = 0
    let northTop = 0
    // Away from the corners, where the west and east panes meet these faces.
    for (let i = 0; i < positions.count; i++) {
      if (positions.getX(i) < 4.2 || positions.getX(i) > 9.8) continue
      if (positions.getZ(i) > 33.9) southTop = Math.max(southTop, positions.getY(i))
      if (positions.getZ(i) < 30.1) northTop = Math.max(northTop, positions.getY(i))
    }
    expect(southTop).toBeCloseTo(SILL_HEIGHT)
    expect(northTop).toBeCloseTo(GLASS_HEIGHT)
  })

  test('a storefront opens a bay in the glass under a sign band', () => {
    const building = block()
    expect(building.placeRoom('shop', 0, 5, 31, 'south')).toEqual({ ok: true })
    const { glass, solid } = buildFloorGeometry(building, 0, {})
    expect(southGlass(glass!, 6, 34)).toEqual([])
    expect(southGlass(glass!, 4, 34).length).toBeGreaterThan(0)
    // The sign band sits just under the ceiling, out past the glass.
    const positions = solid!.getAttribute('position')
    let sign = false
    for (let i = 0; i < positions.count; i++) {
      if (Math.abs(positions.getY(i) - (GLASS_HEIGHT - 0.04)) < 1e-6 && positions.getZ(i) > 34.05) sign = true
    }
    expect(sign).toBe(true)
  })

  test('a basement gets retaining walls instead of glass', () => {
    const building = new Building()
    building.paintPlate(-1, Array.from({ length: 6 }, (_, x) => ({ x, y: 0 })))
    const { solid, glass } = buildFloorGeometry(building, -1, {})
    expect(glass).toBeNull()
    expect(hasColor(solid!, PALETTE.retaining)).toBe(true)
    expect(hasColor(solid!, PALETTE.mullion)).toBe(false)
  })

  test('storefront lettering and awnings stay attached to closed walls, never floating on a cutaway', () => {
    const building = block()
    expect(building.placeRoom('shop', 0, 5, 31, 'south')).toEqual({ ok: true })
    const closed = buildFloorGeometry(building, 0, {})
    const cut = buildFloorGeometry(building, 0, { cutaway: ['south'] })
    expect(closed.signs!.getAttribute('position').count).toBe(4)
    closed.signs!.computeBoundingBox()
    expect(closed.signs!.boundingBox!.min.z).toBeCloseTo(34.085)
    expect(closed.signs!.boundingBox!.min.y).toBeGreaterThan(0.76)
    const canopyVertices = (geometry: THREE.BufferGeometry) => {
      const positions = geometry.getAttribute('position')
      return Array.from({ length: positions.count }, (_, i) => i).filter(i => positions.getZ(i) > 34.5 && positions.getY(i) >= 0.63 && positions.getY(i) <= 0.77)
    }
    expect(canopyVertices(closed.solid!).length).toBeGreaterThan(0)
    expect(canopyVertices(cut.solid!)).toEqual([])
    expect(cut.signs).toBeNull()
    for (const geometry of [closed, cut]) for (const part of Object.values(geometry)) part?.dispose()
  })

  test('the address hangs below the lobby canopy and disappears with its cutaway wall', () => {
    const building = block()
    building.paintCorridor(0, Array.from({ length: 4 }, (_, i) => ({ x: 6, y: 30 + i })))
    const closed = buildFloorGeometry(building, 0, {})
    expect(closed.signs!.getAttribute('position').count).toBe(4)
    closed.signs!.computeBoundingBox()
    expect(closed.signs!.boundingBox!.max.y).toBeLessThan(0.84)
    expect(closed.signs!.boundingBox!.min.z).toBeCloseTo(34.765)
    const cut = buildFloorGeometry(building, 0, { cutaway: ['south'] })
    expect(cut.signs).toBeNull()
    for (const geometry of [closed, cut]) for (const part of Object.values(geometry)) part?.dispose()
  })

  test('the lobby entrance opens the glass under a canopy', () => {
    const building = block()
    const closed = buildFloorGeometry(building, 0, {})
    expect(hasColor(closed.solid!, PALETTE.canopy)).toBe(false)
    building.paintCorridor(0, Array.from({ length: 4 }, (_, i) => ({ x: 6, y: 30 + i })))
    const { glass, solid } = buildFloorGeometry(building, 0, {})
    expect(hasColor(solid!, PALETTE.canopy)).toBe(true)
    expect(southGlass(glass!, 6, 34)).toEqual([])
  })
})
