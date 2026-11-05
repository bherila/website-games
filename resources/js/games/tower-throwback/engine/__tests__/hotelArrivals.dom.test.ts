import { loadSandbox, restoreSandbox, saveSandbox } from '../../gameProgress'
import type { EngineEvent, EngineState, Unit } from '../../gameTypes'
import { itemDef } from '../catalog'
import { settleMidnight } from '../economy'
import { stepEngine } from '../engine'
import { stepHotelMinute } from '../hotel'
import { occupancyPass } from '../occupancy'
import { snapshotPeopleRuntime, stepPeople } from '../people'
import { injectUnit, makeTestState, place, placeSlabRow } from './testState'

function arrivingGuest(kind: 'hotel1p' | 'hotel2p' | 'hotelSuite' = 'hotel1p', grade: Unit['grade'] = 'standard', floor = 0) {
  const state = makeTestState({ star: 3, maxStarReached: 3 })
  placeSlabRow(state, 0, 0, 60)
  const stairsId = floor === 0 ? null : (() => {
    placeSlabRow(state, 1, 0, 60)
    return place(state, 'stairs', 0, 12)
  })()
  const reception = injectUnit(state, { kind: 'hotelReception', floor: 0, x: 0, width: 10, storeys: 1 })
  const room = injectUnit(state, { kind, floor, x: 20, width: itemDef(kind).width, storeys: 1, evalScore: 60, grade })
  occupancyPass(state, [])
  stepHotelMinute(state, 18 * 60)
  stepHotelMinute(state, 20 * 60)
  expect(state.people).toHaveLength(1)
  expect(state.people[0]?.purpose).toBe('hotelCheckIn')
  stepPeople(state, 0.05, [])
  expect(state.people[0]?.x).toBeGreaterThan(0)
  expect(room.occupied).toBe(false)
  return { state, room, reception, stairsId }
}

function finishArrival(state: EngineState): void {
  stepPeople(state, 5, [])
  expect(state.people).toHaveLength(0)
  expect(snapshotPeopleRuntime(state).plans).toHaveLength(0)
}

describe('hotel arrivals revalidate the destination after travel', () => {
  afterEach(() => { window.localStorage.clear() })

  it.each(['fire', 'offline', 'infested', 'dirty', 'reception-offline', 'reception-demolished', 'demolished'] as const)(
    'rejects an in-flight guest when the destination becomes %s', (condition) => {
      const { state, room, reception } = arrivingGuest()
      if (condition === 'fire') {
        room.offline = true
        room.damageKind = 'fire'
      } else if (condition === 'offline') room.offline = true
      else if (condition === 'infested') room.infested = true
      else if (condition === 'dirty') room.dirty = true
      else if (condition === 'reception-offline') reception.offline = true
      else {
        stepEngine(state, [{ type: 'demolishUnit', unitId: condition === 'demolished' ? room.id : reception.id }], 0)
      }
      const before = { ...room, population: { ...room.population }, flags: { ...room.flags } }
      const rngBefore = state.rng.state()

      finishArrival(state)

      expect(room).toEqual(before)
      expect(room.population).toEqual({ low: 0, med: 0, high: 0, vip: 0 })
      expect(room.occupied).toBe(false)
      expect(state.rng.state()).toBe(rngBefore)
      settleMidnight(state, [])
      expect(state.ledgerHistory[0]?.lines['hotel.nights'] ?? 0).toBe(0)
    },
  )

  it('checks the current route even when noRoute has not refreshed since a connector was removed', () => {
    const { state, room, stairsId } = arrivingGuest('hotel1p', 'standard', 1)
    if (stairsId === null) throw new Error('Expected the fixture stairs')
    stepEngine(state, [{ type: 'demolishUnit', unitId: stairsId }], 0)
    expect(room.flags.noRoute).toBe(false) // vacant-room flags have not run again

    finishArrival(state)

    expect(room.occupied).toBe(false)
    expect(room.population).toEqual({ low: 0, med: 0, high: 0, vip: 0 })
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['hotel.nights'] ?? 0).toBe(0)
  })

  it('leaves the existing guest untouched when another guest takes the room during travel', () => {
    const { state, room } = arrivingGuest()
    room.occupied = true
    room.population.vip = 1
    const before = { ...room, population: { ...room.population }, flags: { ...room.flags } }

    finishArrival(state)

    expect(room).toEqual(before)
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['hotel.nights']).toBe(350)
  })

  it('uses live service availability when the cached room flags are stale', () => {
    const { state, room } = arrivingGuest()
    room.flags.noRoute = true
    room.flags.noReception = true

    finishArrival(state)

    expect(room.occupied).toBe(true)
    expect(Object.values(room.population).reduce((sum, count) => sum + count, 0)).toBe(1)
  })

  it.each([
    ['hotel1p', 'standard', 1, 350],
    ['hotel2p', 'standard', 2, 600],
    ['hotelSuite', 'luxury', 2, 2880],
  ] as const)('preserves valid %s %s arrivals, capacity, income, and saved continuation', (kind, grade, capacity, income) => {
    const { state, room } = arrivingGuest(kind, grade)
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    const saved = loadSandbox('slot-a')
    if (!saved) throw new Error('Expected the in-flight hotel save')
    const resumed = restoreSandbox(saved)
    const rngBefore = state.rng.state()

    finishArrival(state)
    finishArrival(resumed)

    expect(room.occupied).toBe(true)
    expect(Object.values(room.population).reduce((sum, count) => sum + count, 0)).toBe(capacity)
    if (grade === 'luxury') expect(room.population.high).toBe(capacity)
    expect(state.rng.state()).toBe(rngBefore)
    const events: EngineEvent[] = []
    settleMidnight(state, events)
    settleMidnight(resumed, [])
    expect(state.ledgerHistory[0]?.lines['hotel.nights']).toBe(income)
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    expect(saveSandbox(resumed, 'slot-b')).toEqual({ ok: true })
    expect(loadSandbox('slot-b')).toEqual(loadSandbox('slot-a'))
  })

  it('retains an invalid in-flight destination across save and resume without creating tenancy', () => {
    const { state, room } = arrivingGuest()
    room.dirty = true
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    const saved = loadSandbox('slot-a')
    if (!saved) throw new Error('Expected the in-flight hotel save')
    const resumed = restoreSandbox(saved)

    finishArrival(state)
    finishArrival(resumed)

    expect(room.dirty).toBe(true)
    expect(room.occupied).toBe(false)
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    expect(saveSandbox(resumed, 'slot-b')).toEqual({ ok: true })
    expect(loadSandbox('slot-b')).toEqual(loadSandbox('slot-a'))
  })
})
