import { makeTestState, place } from '../engine/__tests__/testState'
import type { Unit } from '../gameTypes'
import { catchmentFieldForSelection, saveAndExit } from '../TowerGame'

describe('catchmentFieldForSelection', () => {
  it('caches a commerce field until the tower structure changes', () => {
    const state = makeTestState()
    place(state, 'slab', 0, 0, 10)
    place(state, 'shop', 0, 0)
    const shop = state.units.find((unit) => unit.kind === 'shop') as Unit
    const selection = { type: 'unit', unit: shop } as const

    const initial = catchmentFieldForSelection(state, selection)
    expect(catchmentFieldForSelection(state, selection)).toBe(initial)

    place(state, 'slab', 0, 10, 10)
    expect(catchmentFieldForSelection(state, selection)).not.toBe(initial)
  })
})

describe('saveAndExit', () => {
  it('navigates only after persistence succeeds', () => {
    const state = makeTestState()
    const navigate = jest.fn()
    const successfulSave = jest.fn(() => ({ ok: true as const }))
    const failedSave = jest.fn(() => ({ ok: false as const, reason: 'quotaExceeded' as const }))

    expect(saveAndExit(state, 'slot-a', 'session', navigate, successfulSave)).toEqual({ ok: true })
    expect(navigate).toHaveBeenCalledTimes(1)

    navigate.mockClear()
    expect(saveAndExit(state, 'slot-a', 'session', navigate, failedSave)).toEqual({ ok: false, reason: 'quotaExceeded' })
    expect(navigate).not.toHaveBeenCalled()
  })
})
