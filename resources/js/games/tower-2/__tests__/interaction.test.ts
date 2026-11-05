import { Building, starterBuilding } from '../engine/building'
import { centredOrigin, isRectTool, isUseTool, nextTurn, rectTiles, stepperFloors, toolAction, TOOLS } from '../interaction'

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
    expect(paint.hint).toBe('Shell estimate +$900')
    expect(paint.commit!(building)).toEqual({ ok: true })
    expect(building.plateArea(0)).toBe(9)
    expect(toolAction(building, 'erase', 0, { x: 2, y: 2 }, null, 'south').preview).toMatchObject({ tone: 'erase', valid: true })
  })

  test('floor previews quote overhangs and share reach checks with paint, clear and atrium commits', () => {
    const building = new Building()
    building.paintPlate(0, [{ x: 10, y: 10 }])
    const paint = toolAction(building, 'plate', 1, { x: 13, y: 10 }, { x: 10, y: 10 }, 'south')
    expect(paint.hint).toBe('Shell estimate +$1,100 · 3 overhang tiles at 3× price')
    expect(paint.preview?.valid).toBe(true)
    expect(paint.commit!(building)).toEqual({ ok: true })
    const tooFar = toolAction(building, 'plate', 1, { x: 14, y: 10 }, null, 'south')
    expect(tooFar.preview?.valid).toBe(false)
    expect(tooFar.commit!(building)).toEqual({ ok: false, reason: tooFar.hint })
    for (const tool of ['erase', 'atrium'] as const) {
      const action = toolAction(building, tool, 1, { x: 11, y: 10 }, null, 'south')
      expect(action.preview?.valid).toBe(false)
      expect(action.commit!(building)).toEqual({ ok: false, reason: action.hint })
    }
    const clearSupport = toolAction(building, 'erase', 0, { x: 10, y: 10 }, null, 'south')
    expect(clearSupport.preview?.valid).toBe(false)
    expect(clearSupport.commit!(building)).toEqual({ ok: false, reason: clearSupport.hint })
  })

  test('core and room tools preview their footprint, range and door', () => {
    const building = starterBuilding()
    const core = toolAction(building, 'core', 0, { x: 14, y: 29 }, null, 'south')
    expect(core.preview).toMatchObject({ kind: 'core', x: 14, y: 29, bottomFloor: 0, topFloor: 1, valid: true })
    expect(core.hint).toBe('1 car over floors G–1')
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

  test('four turns bring a rectangular room back to where it started', () => {
    // A corridor ring round the 4×4 union of a studio's two orientations lets every facing fit.
    const building = new Building()
    building.paintPlate(0, Array.from({ length: 8 * 8 }, (_, i) => ({ x: 8 + (i % 8), y: 8 + Math.floor(i / 8) })))
    const ring = [9, 14].flatMap((v) => [9, 10, 11, 12, 13, 14].flatMap((w) => [{ x: w, y: v }, { x: v, y: w }]))
    building.paintCorridor(0, ring)
    expect(building.placeRoom('studio', 0, 10, 10, 'south')).toEqual({ ok: true })
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      const studio = building.room(1)!
      const turn = nextTurn(building, studio)!
      expect(building.moveRoom(1, turn.x, turn.y, turn.facing)).toEqual({ ok: true })
      seen.push(turn.facing)
    }
    expect(seen).toEqual(['west', 'north', 'east', 'south'])
    expect(building.room(1)).toMatchObject({ x: 10, y: 10, facing: 'south' })
  })
})

describe('the floor stepper', () => {
  test('offers the built floors and one empty floor beyond each end, within the site', () => {
    expect(stepperFloors([], 0, -3, 23)).toEqual([1, 0, -1])
    expect(stepperFloors([0, 1, 2], 0, -3, 23)).toEqual([3, 2, 1, 0, -1])
    // Stepping onto the empty floor above offers the next one up.
    expect(stepperFloors([0, 1, 2], 3, -3, 23)).toEqual([4, 3, 2, 1, 0, -1])
    expect(stepperFloors([-3, 0], -3, -3, 23)).toEqual([1, 0, -1, -2, -3])
    expect(stepperFloors([0, 23], 23, -3, 23)[0]).toBe(23)
  })
})
