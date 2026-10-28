import { Building, starterBuilding } from '../engine/building'
import { centredOrigin, isRectTool, isUseTool, nextTurn, rectTiles, toolAction, TOOLS } from '../interaction'

describe('tools', () => {
  test('have unique keys and a hint each, and classify drag and room tools', () => {
    expect(new Set(TOOLS.map((tool) => tool.key)).size).toBe(TOOLS.length)
    expect(TOOLS.every((tool) => tool.hint.length > 0)).toBe(true)
    expect(['plate', 'erase', 'atrium', 'corridor'].every((tool) => isRectTool(tool as never))).toBe(true)
    expect(isRectTool('core')).toBe(false)
    expect(isUseTool('cafe')).toBe(true)
    expect(isUseTool('select')).toBe(false)
  })

  test('rectangles span either drag direction, and footprints centre on the pointer', () => {
    expect(rectTiles({ x: 4, y: 1 }, { x: 2, y: 2 })).toMatchObject({ x: 2, y: 1, width: 3, depth: 2 })
    expect(rectTiles({ x: 4, y: 1 }, { x: 2, y: 2 }).tiles).toHaveLength(6)
    expect(centredOrigin({ x: 10, y: 10 }, 4, 5)).toEqual({ x: 9, y: 8 })
    expect(centredOrigin({ x: 10, y: 10 }, 2, 2)).toEqual({ x: 10, y: 10 })
  })
})

describe('tool actions', () => {
  test('nothing happens without a hovered tile or with the select tool', () => {
    const building = starterBuilding()
    expect(toolAction(building, 'plate', 0, null, null, 'south')).toEqual({ preview: null, hint: null, commit: null })
    expect(toolAction(building, 'select', 0, { x: 1, y: 1 }, null, 'south').commit).toBeNull()
  })

  test('drag tools preview the rectangle, explain refusals and commit the same edit', () => {
    const building = new Building()
    const corridor = toolAction(building, 'corridor', 0, { x: 3, y: 3 }, { x: 1, y: 1 }, 'south')
    expect(corridor.hint).toBe('Corridors go on open floor plate')
    expect(corridor.preview).toMatchObject({ kind: 'rect', x: 1, y: 1, width: 3, depth: 3, valid: false })
    const paint = toolAction(building, 'plate', 0, { x: 3, y: 3 }, { x: 1, y: 1 }, 'south')
    expect(paint.hint).toBeNull()
    expect(paint.commit!(building)).toEqual({ ok: true })
    expect(building.plateArea(0)).toBe(9)
    expect(toolAction(building, 'erase', 0, { x: 2, y: 2 }, null, 'south').preview).toMatchObject({ tone: 'erase', valid: true })
  })

  test('core and room tools preview their footprint, range and door', () => {
    const building = starterBuilding()
    const core = toolAction(building, 'core', 0, { x: 14, y: 29 }, null, 'south')
    expect(core.preview).toMatchObject({ kind: 'core', x: 14, y: 29, bottomFloor: 0, topFloor: 1, valid: true })
    expect(core.hint).toBe('Core over floors 0–1')
    const shop = toolAction(building, 'shop', 0, { x: 24, y: 31 }, null, 'south')
    expect(shop.preview).toMatchObject({ kind: 'room', x: 23, y: 30, width: 3, depth: 3, valid: true, door: { x: 24, y: 32 } })
    const turned = toolAction(building, 'office', 1, { x: 25, y: 36 }, null, 'east')
    expect(turned.preview).toMatchObject({ width: 5, depth: 4 })
    expect(shop.commit!(building)).toEqual({ ok: true })
    expect(building.allRooms()).toHaveLength(5)
  })
})

describe('turning a placed room', () => {
  test('skips a quarter-turn that does not fit to reach the next facing that does', () => {
    // A three-tile-wide strip with corridors at both ends: a 3×4 studio fits facing south or north only.
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 3 * 6 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3) })))
    building.paintCorridor(0, [0, 1, 2].map((x) => ({ x, y: 0 })))
    building.paintCorridor(0, [0, 1, 2].map((x) => ({ x, y: 5 })))
    expect(building.placeRoom('studio', 0, 0, 1, 'south')).toEqual({ ok: true })
    const studio = building.room(1)!
    expect(nextTurn(building, studio)).toEqual({ x: 0, y: 1, facing: 'north' })
    // With the north corridor gone, nothing else fits.
    building.erase(0, [0, 1, 2].map((x) => ({ x, y: 0 })))
    expect(nextTurn(building, studio)).toBeNull()
  })
})
