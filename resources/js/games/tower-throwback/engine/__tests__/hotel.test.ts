import type { EngineEvent, EngineState, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { nightlyRoomIncome, settleMidnight } from '../economy'
import { stepElevators } from '../elevators'
import { nightlyGuestTarget, stepHotelMinute } from '../hotel'
import { occupancyPass } from '../occupancy'
import { stepPeople } from '../people'
import { stepSchedules } from '../schedules'
import { injectUnit, makeTestState, placeShaft, placeSlabRow, setStars } from './testState'

function hotelFloor(state: EngineState, roomCount = 4): Unit[] {
  placeSlabRow(state, 0, 0, 60)
  injectUnit(state, { kind: 'hotelReception', floor: 0, x: 0, width: 10, storeys: 1 })
  const rooms: Unit[] = []
  for (let i = 0; i < roomCount; i++) {
    rooms.push(injectUnit(state, { kind: 'hotel1p', floor: 0, x: 12 + i * 4, width: 4, storeys: 1, evalScore: 60 }))
  }
  return rooms
}

function runMinutes(state: EngineState, from: number, to: number): void {
  for (let m = from; m <= to; m++) {
    stepSchedules(state, m - 1, m, [])
    stepPeople(state, 1, [])
  }
}

describe('nightly demand', () => {
  it('matches the spec formula exactly', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    hotelFloor(state, 10) // 10 rooms at eval 60
    // rate = min(0.9, 0.4 + 0.05×3 + 0.2×60/100) = 0.67 → round(10 × 0.67) = 7.
    expect(nightlyGuestTarget(state)).toBe(7)
  })
})

describe('check-in / income / checkout', () => {
  it('guests check in during the evening, bill at midnight, and dirty the room at checkout', () => {
    const state = makeTestState()
    const rooms = hotelFloor(state, 2)
    occupancyPass(state, []) // clears noReception etc.

    runMinutes(state, 18 * 60, 22 * 60)
    const occupiedRooms = rooms.filter((r) => r.occupied)
    expect(occupiedRooms.length).toBeGreaterThan(0)
    const first = occupiedRooms[0]!
    const pop = first.population
    expect(pop.low + pop.med + pop.high + pop.vip).toBe(1) // hotel1p capacity

    // Midnight settlement bills each occupied room.
    state.ledgerToday.day = 1
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['hotel.nights']).toBe(occupiedRooms.length * 350)

    // Morning checkout: room empties and turns dirty.
    state.clock.day = 2
    runMinutes(state, 7 * 60, 9 * 60)
    expect(first.occupied).toBe(false)
    expect(first.dirty).toBe(true)
    expect(first.population).toEqual({ low: 0, med: 0, high: 0, vip: 0 })
  })

  it('luxury rooms bill ×1.6 on top of the rent tier', () => {
    const luxury = injectUnit(makeTestState(), {
      kind: 'hotel2p', floor: 0, x: 0, width: 6, storeys: 1, grade: 'luxury', rentTier: 'high', occupied: true,
    })
    // 600 × 1.25 × 1.6 = 1200.
    expect(nightlyRoomIncome(luxury)).toBe(1200)
  })

  it('dirty rooms are skipped for check-in until cleaned', () => {
    const state = makeTestState()
    const rooms = hotelFloor(state, 2)
    rooms[0]!.dirty = true
    occupancyPass(state, [])
    runMinutes(state, 18 * 60, 22 * 60)
    expect(rooms[0]!.occupied).toBe(false)
    expect(rooms[1]!.occupied).toBe(true)
  })
})

describe('reception dependency', () => {
  it('no reception → flags, vacancy reason, and zero guests', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 60)
    const room = injectUnit(state, { kind: 'hotel1p', floor: 0, x: 12, width: 4, storeys: 1, evalScore: 60 })
    occupancyPass(state, [])
    expect(room.flags.noReception).toBe(true)
    expect(room.vacancyReason).toBe('noReception')

    runMinutes(state, 18 * 60, 22 * 60)
    expect(room.occupied).toBe(false)
    expect(state.people).toHaveLength(0)
  })
})

describe('housekeeping', () => {
  it('cleaners ride service shafts only and clear dirty after the dwell', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    placeSlabRow(state, 0, 0, 60)
    for (let f = 1; f <= 2; f++) {
      placeSlabRow(state, f, 0, 60)
    }
    const serviceId = placeShaft(state, 'service', 30, 0, 2)
    injectUnit(state, { kind: 'hotelReception', floor: 0, x: 0, width: 10, storeys: 1 })
    injectUnit(state, { kind: 'housekeeping', floor: 0, x: 12, width: 8, storeys: 1 })
    const room = injectUnit(state, { kind: 'hotel1p', floor: 2, x: 10, width: 4, storeys: 1, dirty: true })

    stepHotelMinute(state, 10 * 60) // dispatch tick (minute % 10 === 0)
    const cleaner = state.people.find((p) => p.purpose === 'housekeeping')
    expect(cleaner).toBeDefined()
    const elevatorLeg = cleaner!.legs.find((l) => l.type === 'elevator')
    expect(elevatorLeg?.shaftId).toBe(serviceId) // staff routing → the service shaft

    // Ride up, clean for cleanMinutes, dirty clears at the dwell end.
    const events: EngineEvent[] = []
    for (let t = 0; t < TUNING.hotel.cleanMinutes + 30 && room.dirty; t += 0.5) {
      stepElevators(state, 0.5, events)
      stepPeople(state, 0.5, events)
    }
    expect(room.dirty).toBe(false)
  })

  it('respects the concurrent-staff cap per housekeeping unit', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 80)
    injectUnit(state, { kind: 'hotelReception', floor: 0, x: 0, width: 10, storeys: 1 })
    injectUnit(state, { kind: 'housekeeping', floor: 0, x: 12, width: 8, storeys: 1 })
    for (let i = 0; i < 6; i++) {
      injectUnit(state, { kind: 'hotel1p', floor: 0, x: 22 + i * 4, width: 4, storeys: 1, dirty: true })
    }
    stepHotelMinute(state, 600)
    expect(state.people.filter((p) => p.purpose === 'housekeeping')).toHaveLength(TUNING.hotel.housekeepersPerUnit)
  })

  it('without housekeeping, rooms stay dirty with the hotelDirty reason', () => {
    const state = makeTestState()
    const rooms = hotelFloor(state, 1)
    rooms[0]!.dirty = true
    stepHotelMinute(state, 600)
    expect(state.people).toHaveLength(0)
    occupancyPass(state, [])
    expect(rooms[0]!.vacancyReason).toBe('hotelDirty')
  })
})
