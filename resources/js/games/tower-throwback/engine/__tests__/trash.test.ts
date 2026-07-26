import type { EngineState, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { evalUnit } from '../occupancy'
import { generateDailyTrash, haulTrash, trashLoad } from '../trash'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

function occupiedOffice(state: EngineState, x: number, med = 4): Unit {
  return injectUnit(state, {
    kind: 'officeS', floor: 0, x, width: 6, storeys: 1,
    occupied: true, population: { low: 0, med, high: 0, vip: 0 },
  })
}

describe('generation', () => {
  it('accumulates occupants × perOccupantPerDay into the nearest room', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 80)
    const nearRoom = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 20, width: 6, storeys: 1 })
    const farRoom = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 70, width: 6, storeys: 1 })
    occupiedOffice(state, 0, 4)
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 60, width: 4, storeys: 1,
      occupied: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })

    generateDailyTrash(state)
    expect(trashLoad(state, nearRoom.id)).toBe(4) // the office is nearer to x20
    expect(trashLoad(state, farRoom.id)).toBe(2) // the apartment lands at x70
  })

  it('recycling-grade rooms halve accumulation', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const room = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 20, width: 6, storeys: 1, grade: 'recycling' })
    occupiedOffice(state, 0, 4)
    generateDailyTrash(state)
    expect(trashLoad(state, room.id)).toBe(4 * TUNING.trash.recyclingHaulFactor)
  })

  it('a recycling center halves accumulation tower-wide', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, -1, 0, 40)
    const room = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 20, width: 6, storeys: 1 })
    injectUnit(state, { kind: 'recyclingCenter', floor: -1, x: 0, width: 20, storeys: 1 })
    occupiedOffice(state, 0, 4)
    generateDailyTrash(state)
    expect(trashLoad(state, room.id)).toBe(2)
  })

  it('no trash room → no loads and no overflow mechanic', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 40)
    const office = occupiedOffice(state, 0, 4)
    generateDailyTrash(state)
    expect(office.flags.trashOverflow).toBe(false)
  })
})

describe('overflow and haul', () => {
  it('flags the room past capacity, penalizes neighbors, and clears at the 04:00 haul', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    const room = injectUnit(state, { kind: 'trashRoom', floor: 0, x: 20, width: 6, storeys: 1 })
    const neighbor = injectUnit(state, { kind: 'aptStudio', floor: 0, x: 30, width: 4, storeys: 1 })
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, population: { low: 130, med: 0, high: 0, vip: 0 },
    })

    const cleanEval = evalUnit(state, neighbor)
    generateDailyTrash(state)
    expect(trashLoad(state, room.id)).toBe(130)
    expect(room.flags.trashOverflow).toBe(true)
    expect(evalUnit(state, neighbor)).toBe(cleanEval - TUNING.evalWeights.trashPenalty)

    haulTrash(state)
    expect(trashLoad(state, room.id)).toBe(0)
    expect(room.flags.trashOverflow).toBe(false)
    expect(evalUnit(state, neighbor)).toBe(cleanEval)
  })

  it('haulers ride service shafts to the recycling center', () => {
    const state = makeTestState()
    setStars(state, 4, 4)
    placeSlabRow(state, 0, 0, 40)
    placeSlabRow(state, -1, 0, 40)
    placeSlabRow(state, 1, 0, 40)
    placeSlabRow(state, 2, 0, 40)
    const serviceId = placeShaft(state, 'service', 30, -1, 2)
    const room = injectUnit(state, { kind: 'trashRoom', floor: 2, x: 0, width: 6, storeys: 1 })
    injectUnit(state, { kind: 'recyclingCenter', floor: -1, x: 0, width: 20, storeys: 1 })
    occupiedOffice(state, 10, 4)

    generateDailyTrash(state)
    expect(trashLoad(state, room.id)).toBe(2) // halved by the recycling center
    haulTrash(state)

    const haulers = state.people.filter((p) => p.purpose === 'trashHaul')
    expect(haulers).toHaveLength(TUNING.trash.haulersPerTrashRoom)
    for (const hauler of haulers) {
      expect(hauler.legs.find((l) => l.type === 'elevator')?.shaftId).toBe(serviceId)
      expect(hauler.legs[hauler.legs.length - 1]?.toFloor).toBe(-1)
    }
  })
})
