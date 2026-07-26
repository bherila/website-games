import * as THREE from 'three'

import { makeTestState, placeSlabRow } from '../../engine/__tests__/testState'
import { TUNING } from '../../gameTypes'
import { placementRangeTiles } from '../placementRange'
import { createPlacementRangeLayer, disposePlacementRangeLayer, setPlacementRange } from '../placementRangeLayer'

describe('placementRangeTiles', () => {
  it('clips restroom service coverage to its same-floor walkable segment', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 10, 130)
    placeSlabRow(state, 1, 10, 90)
    placeSlabRow(state, 1, 100, 130)

    const tiles = placementRangeTiles(state, [{ type: 'place', kind: 'restroom', floor: 1, x: 50 }])

    expect(tiles.every((tile) => tile.kind === 'benefit' && tile.floor === 1)).toBe(true)
    expect(Math.min(...tiles.map((tile) => tile.x))).toBe(50 - TUNING.grid.restroomRangeTiles)
    expect(Math.max(...tiles.map((tile) => tile.x))).toBe(53 + TUNING.grid.restroomRangeTiles)
    expect(tiles.some((tile) => tile.x >= 50 && tile.x <= 53)).toBe(false)
    expect(tiles.some((tile) => tile.x >= 100)).toBe(false)
  })

  it('uses the catalog noise radius and canonical cross-floor propagation', () => {
    const state = makeTestState()
    const tiles = placementRangeTiles(state, [{ type: 'place', kind: 'fastfood', floor: 4, x: 20 }])

    expect(tiles).toContainEqual({ floor: 4, kind: 'impact', strength: 0.875, x: 19 })
    expect(tiles).toContainEqual({ floor: 3, kind: 'impact', strength: 0.4375, x: 19 })
    expect(tiles).toContainEqual({ floor: 2, kind: 'impact', strength: 0.21875, x: 19 })
    expect(tiles.some((tile) => tile.x >= 20 && tile.x <= 31)).toBe(false)
    expect(tiles.some((tile) => tile.floor === 1)).toBe(false)
    expect(tiles.some((tile) => tile.x === 12)).toBe(false)
    expect(tiles.some((tile) => tile.x === 13)).toBe(true)
  })

  it('deduplicates overlapping bulk previews and omits units without a placement range', () => {
    const state = makeTestState()
    const command = { type: 'place', kind: 'fastfood', floor: 1, x: 20 } as const
    const once = placementRangeTiles(state, [command])

    expect(placementRangeTiles(state, [command, command])).toEqual(once)
    expect(placementRangeTiles(state, [{ type: 'place', kind: 'officeS', floor: 1, x: 20 }])).toEqual([])
  })
})

describe('placement range layer', () => {
  it('keeps the range sparse, behind the footprint, and separately colored', () => {
    const scene = new THREE.Scene()
    const layer = createPlacementRangeLayer(scene)

    setPlacementRange(layer, [
      { floor: 1, kind: 'benefit', strength: 1, x: 3 },
      { floor: 1, kind: 'impact', strength: 1, x: 4 },
    ])

    expect(layer.mesh.count).toBe(2)
    expect(layer.mesh.visible).toBe(true)
    expect(layer.mesh.position.z).toBeGreaterThan(6)
    expect(layer.mesh.renderOrder).toBeLessThan(60)
    expect(layer.mesh.instanceColor?.getX(0)).not.toBe(layer.mesh.instanceColor?.getX(1))

    setPlacementRange(layer, [])
    expect(layer.mesh.visible).toBe(false)
    disposePlacementRangeLayer(layer)
    expect(scene.children).not.toContain(layer.mesh)
  })
})
