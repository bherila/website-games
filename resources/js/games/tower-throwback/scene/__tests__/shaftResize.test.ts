import { makeTestState, place, placeShaft, placeSlabRow, setStars } from '../../engine/__tests__/testState'
import { validateShaftResize } from '../../engine/placement'
import type { ShaftKind } from '../../gameTypes'
import { shaftCapAt, shaftResizeCommandForDrag, shaftResizePreview } from '../shaftResize'

function stateWithShaft() {
  const state = makeTestState()
  for (let floor = 0; floor <= 8; floor += 1) {
    placeSlabRow(state, floor, 0, 30)
  }
  const shaftId = placeShaft(state, 'standard', 10, 0, 2)
  return { state, shaftId }
}

describe('shaft machinery resize helpers', () => {
  it('hit-tests both cap tiles without cross-matching adjacent shafts', () => {
    const { state, shaftId } = stateWithShaft()
    const adjacentId = placeShaft(state, 'standard', 12, 0, 2)

    expect(shaftCapAt(state, { floor: 3, x: 10 })).toEqual({ shaftId, end: 'top' })
    expect(shaftCapAt(state, { floor: -1, x: 11 })).toEqual({ shaftId, end: 'bottom' })
    expect(shaftCapAt(state, { floor: 3, x: 12 })).toEqual({ shaftId: adjacentId, end: 'top' })
    expect(shaftCapAt(state, { floor: 3, x: 14 })).toBeNull()
    expect(shaftCapAt(state, { floor: 2, x: 10 })).toBeNull()
  })

  it('does not claim cap tiles occupied by a unit or another shaft', () => {
    const { state, shaftId } = stateWithShaft()
    place(state, 'officeS', 3, 10) // office directly above the machinery cap tiles
    const lowerId = placeShaft(state, 'standard', 20, 0, 2)
    const stackedId = placeShaft(state, 'standard', 20, 3, 5) // vertically stacked on lowerId

    expect(shaftCapAt(state, { floor: 3, x: 10 })).toBeNull() // office owns the tile
    expect(shaftCapAt(state, { floor: 3, x: 20 })).toBeNull() // stacked shaft's landing, not lower's cap
    expect(shaftCapAt(state, { floor: 2, x: 20 })).toBeNull() // lower shaft's landing, not stacked's cap
    expect(shaftCapAt(state, { floor: 6, x: 20 })).toEqual({ shaftId: stackedId, end: 'top' })
    expect(shaftCapAt(state, { floor: -1, x: 20 })).toEqual({ shaftId: lowerId, end: 'bottom' })
    expect(shaftCapAt(state, { floor: -1, x: 10 })).toEqual({ shaftId, end: 'bottom' })
  })

  it('hit-tests both machinery caps for every shaft kind', () => {
    const state = makeTestState()
    setStars(state, 4)
    for (let floor = 0; floor <= 2; floor += 1) {
      placeSlabRow(state, floor, 0, 40)
    }
    const kinds: ShaftKind[] = ['standard', 'express', 'service', 'glass']

    kinds.forEach((kind, index) => {
      const x = 4 + index * 8
      const shaftId = placeShaft(state, kind, x, 0, 2)
      expect(shaftCapAt(state, { floor: 3, x })).toEqual({ shaftId, end: 'top' })
      expect(shaftCapAt(state, { floor: -1, x })).toEqual({ shaftId, end: 'bottom' })
    })
  })

  it('maps cap floors to absolute resize commands and suppresses clicks/tools', () => {
    const { state, shaftId } = stateWithShaft()
    const top = { shaftId, end: 'top' as const }
    const bottom = { shaftId, end: 'bottom' as const }

    expect(shaftResizeCommandForDrag(state, top, 7, { moved: true, toolActive: false })).toEqual({
      type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6,
    })
    expect(shaftResizeCommandForDrag(state, bottom, -3, { moved: true, toolActive: false })).toEqual({
      type: 'resizeShaft', shaftId, bottomFloor: -2, topFloor: 2,
    })
    expect(shaftResizeCommandForDrag(state, top, 7, { moved: false, toolActive: false })).toBeNull()
    expect(shaftResizeCommandForDrag(state, top, 7, { moved: true, toolActive: true })).toBeNull()
  })

  it('uses the exact engine validator for ghost cost and validity', () => {
    const { state, shaftId } = stateWithShaft()
    const fixtures = [
      { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 6 },
      { type: 'resizeShaft', shaftId, bottomFloor: 0, topFloor: 31 },
      { type: 'resizeShaft', shaftId, bottomFloor: -1, topFloor: 2 },
    ] as const

    for (const command of fixtures) {
      expect(shaftResizePreview(state, command)).toEqual(validateShaftResize(state, command))
    }
  })
})
