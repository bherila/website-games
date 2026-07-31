import { makeTestState } from '../engine/__tests__/testState'
import { stepEngine } from '../engine/engine'
import {
  beginPlacementDrag,
  bulkGhostsForCommands,
  hoverPreviewRequiresClear,
  keyboardActionForKey,
  keyboardPlacementCommand,
  overlayRefreshRequired,
} from '../TowerScene'

describe('bulkGhostsForCommands', () => {
  it('simulates bottom-to-top slab commands without mutating the live state', () => {
    const state = makeTestState()
    const ghosts = bulkGhostsForCommands(state, [
      { type: 'place', kind: 'slab', floor: 0, x: 0, widthTiles: 10 },
      { type: 'place', kind: 'slab', floor: 1, x: 0, widthTiles: 10 },
      { type: 'place', kind: 'slab', floor: 2, x: 0, widthTiles: 10 },
    ])

    expect(ghosts.map((ghost) => ghost.valid)).toEqual([true, true, true])
    expect(state.units).toEqual([])
    expect(state.structureVersion).toBe(0)
    expect(state.grid.slab.some((cell) => cell !== 0)).toBe(false)
  })
})

describe('overlay refresh cadence', () => {
  it('refreshes on selection, every two seconds, or a structure change', () => {
    expect(overlayRefreshRequired('noise', null, 0, 1, 1)).toBe(true)
    expect(overlayRefreshRequired('noise', 'noise', 1.99, 1, 1)).toBe(false)
    expect(overlayRefreshRequired('noise', 'noise', 2, 1, 1)).toBe(true)
    expect(overlayRefreshRequired('noise', 'noise', 0, 2, 1)).toBe(true)
    expect(overlayRefreshRequired(null, 'noise', 0, 2, 1)).toBe(true)
    expect(overlayRefreshRequired(null, null, 10, 2, 1)).toBe(false)
  })
})

describe('canvas keyboard navigation', () => {
  it('maps navigation keys to encapsulated scene actions', () => {
    expect(keyboardActionForKey('ArrowLeft')).toEqual({ type: 'pan', dx: 40, dy: 0 })
    expect(keyboardActionForKey('D', true)).toEqual({ type: 'pan', dx: -120, dy: 0 })
    expect(keyboardActionForKey('+')).toEqual({ type: 'zoom', factor: 0.8 })
    expect(keyboardActionForKey('-')).toEqual({ type: 'zoom', factor: 1.25 })
    expect(keyboardActionForKey('Escape')).toEqual({ type: 'cancel' })
    expect(keyboardActionForKey('Enter')).toEqual({ type: 'activate' })
    expect(keyboardActionForKey('Tab')).toBeNull()
  })

  it('routes invalid keyboard placement through the engine rejection seam', () => {
    const state = makeTestState()
    const command = keyboardPlacementCommand(
      { isShaft: false, kind: 'officeS' },
      { floor: 20, x: 10 },
    )

    const events = stepEngine(state, [command], 0)

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'placementRejected' }),
    ]))
    expect(state.units).toHaveLength(0)
  })
})

describe('placement drag sessions', () => {
  const officeTool = { isShaft: false, kind: 'officeS' } as const

  it('latches Shift bulk mode independently for consecutive drags', () => {
    const first = beginPlacementDrag(officeTool, { floor: 1, x: 10 }, 1, true)
    const second = beginPlacementDrag(officeTool, { floor: 2, x: 20 }, 2, true)

    expect(first).toMatchObject({ bulkMode: true, pointerId: 1 })
    expect(second).toMatchObject({ bulkMode: true, pointerId: 2 })
  })

  it('snapshots the selected tool and never enables grids for shafts', () => {
    const session = beginPlacementDrag(officeTool, { floor: 1, x: 10 }, 3, false)
    const shaft = beginPlacementDrag({ isShaft: true, kind: 'standard' }, { floor: 0, x: 5 }, 4, true)

    expect(session.tool).not.toBe(officeTool)
    expect(session.bulkMode).toBe(false)
    expect(shaft.bulkMode).toBe(false)
  })

  it('preserves an active drag but clears stale hover previews after a tool change', () => {
    expect(hoverPreviewRequiresClear(true, 'item:restroom', null)).toBe(false)
    expect(hoverPreviewRequiresClear(false, 'item:restroom', officeTool)).toBe(true)
    expect(hoverPreviewRequiresClear(false, 'item:officeS', officeTool)).toBe(false)
  })
})
