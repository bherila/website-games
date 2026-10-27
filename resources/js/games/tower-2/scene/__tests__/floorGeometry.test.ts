import * as THREE from 'three'

import { Building, starterBuilding } from '../../engine/building'
import { buildFloorGeometry, buildGridGeometry, SILL_HEIGHT } from '../floorGeometry'
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
    expect(buildFloorGeometry(new Building(), 3, { glassHeight: SILL_HEIGHT })).toEqual({ solid: null, glass: null })
  })

  test('a floor sits at its height with corridors, rooms, cores and glass no taller than asked', () => {
    const building = starterBuilding()
    const { solid, glass } = buildFloorGeometry(building, 1, { glassHeight: SILL_HEIGHT, selectedCoreId: 'core-1' })
    solid!.computeBoundingBox()
    glass!.computeBoundingBox()
    expect(solid!.boundingBox!.min.y).toBeCloseTo(FLOOR_HEIGHT - 0.16)
    expect(glass!.boundingBox!.max.y).toBeCloseTo(FLOOR_HEIGHT + SILL_HEIGHT)
    expect(hasColor(solid!, PALETTE.corridor)).toBe(true)
    expect(hasColor(solid!, PALETTE.select)).toBe(true)
    expect(hasColor(solid!, PALETTE.coreBand)).toBe(false)
    expect(hasColor(solid!, PALETTE.overhang)).toBe(false)
  })

  test('cantilevered plate is tinted, and merged runs keep the slab cheap', () => {
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })))
    building.paintPlate(1, Array.from({ length: 6 }, (_, x) => ({ x, y: 0 })))
    const { solid } = buildFloorGeometry(building, 1, { glassHeight: SILL_HEIGHT })
    expect(hasColor(solid!, PALETTE.overhang)).toBe(true)
    // Two runs (plate, overhang), five visible faces of four vertices each.
    expect(solid!.getAttribute('position').count).toBe(2 * 5 * 4)
  })

  test('the drawing grid covers the whole lot at the floor height', () => {
    const grid = buildGridGeometry(4, 3, 2)
    expect(grid.getAttribute('position').count).toBe((5 + 4) * 2)
    grid.computeBoundingBox()
    expect(grid.boundingBox!.min.y).toBeCloseTo(2 * FLOOR_HEIGHT + 0.005)
  })
})
