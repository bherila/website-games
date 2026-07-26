import { makeTestState, placeShaft, placeSlabRow } from '../../engine/__tests__/testState'
import { createCarGlideStore, prepareSceneFrame } from '../sceneFrame'

describe('prepareSceneFrame', () => {
  it('shares one unit index and persistent car glide store across scene renderers', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 10)
    placeSlabRow(state, 1, 0, 10)
    const shaftId = placeShaft(state, 'standard', 4, 0, 1)
    const shaft = state.shafts.find((candidate) => candidate.id === shaftId)!
    shaft.cars[0]!.y = 3
    shaft.cars[0]!.passengerIds = [7]
    state.units[0]!.id = 42

    const carGlides = createCarGlideStore()
    const firstFrame = prepareSceneFrame(state, carGlides, 0)

    expect(firstFrame.unitsById.get(42)).toBe(state.units[0])
    expect(firstFrame.shaftsById.get(shaftId)).toBe(shaft)
    expect(firstFrame.carVisual).toBe(carGlides.carVisual)
    expect(firstFrame.riderY.get(7)).toBe(3)

    shaft.cars[0]!.y = 5
    const secondFrame = prepareSceneFrame(state, carGlides, 0.25)

    expect(secondFrame.carVisual).toBe(firstFrame.carVisual)
    expect(secondFrame.shaftsById).toBe(firstFrame.shaftsById)
    expect(secondFrame.carVisual.get(`${shaftId}:0`)?.y).toBe(5)
  })

  it('indexes queued people once in arrival order for every renderer', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 10)
    placeSlabRow(state, 1, 0, 10)
    const shaftId = placeShaft(state, 'standard', 4, 0, 1)
    state.people = [10, 11].map((id) => ({
      id,
      tier: 'low' as const,
      vip: false,
      state: 'queued' as const,
      floor: 0,
      x: 4,
      patienceLeft: 60,
      irritated: false,
      legs: [{ type: 'elevator' as const, fromFloor: 0, fromX: 4, toFloor: 1, toX: 4, shaftId }],
      legIndex: 0,
      purpose: 'commuteIn' as const,
      tenantUnitId: null,
      destUnitId: null,
    }))

    const frame = prepareSceneFrame(state, createCarGlideStore(), 0)

    expect(frame.queueRankByPersonId.get(10)).toBe(0)
    expect(frame.queueRankByPersonId.get(11)).toBe(1)
  })

  it('shares destination units with active dwelling visitors', () => {
    const state = makeTestState()
    state.people = [{
      id: 12,
      tier: 'low',
      vip: false,
      state: 'walking',
      floor: 0,
      x: 8,
      patienceLeft: 60,
      irritated: false,
      legs: [],
      legIndex: 0,
      purpose: 'shopping',
      tenantUnitId: null,
      destUnitId: 42,
    }]

    const frame = prepareSceneFrame(state, createCarGlideStore(), 0)

    expect(frame.activeVisitorUnitIds).toEqual(new Set([42]))
  })
})
