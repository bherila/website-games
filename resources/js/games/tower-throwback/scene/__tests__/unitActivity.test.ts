import { injectUnit, makeTestState } from '../../engine/__tests__/testState'
import type { GameClock, Unit } from '../../gameTypes'
import { unitVisualActivity } from '../unitActivity'

const NO_VISITORS = new Set<number>()

function clock(day: number, hour: number, minute = 0): GameClock {
  return { day, minute: hour * 60 + minute }
}

function occupiedUnit(kind: Unit['kind'], id = 20): Unit {
  const state = makeTestState()
  state.nextId = id
  return injectUnit(state, { kind, floor: 1, x: 10, width: 8, storeys: 1, occupied: true })
}

describe('unitVisualActivity', () => {
  it('shows offices after arrivals on weekdays but not overnight or on weekends', () => {
    const office = occupiedUnit('officeS')

    expect(unitVisualActivity(office, clock(1, 6, 59), NO_VISITORS)).toBe('vacant')
    expect(unitVisualActivity(office, clock(1, 10), NO_VISITORS)).toBe('occupied')
    expect(unitVisualActivity(office, clock(1, 19), NO_VISITORS)).toBe('vacant')
    expect(unitVisualActivity(office, clock(6, 10), NO_VISITORS)).toBe('vacant')
  })

  it('shows residents awake by day and sleeping overnight', () => {
    const apartment = occupiedUnit('apt1br')

    expect(unitVisualActivity(apartment, clock(1, 6), NO_VISITORS)).toBe('occupied')
    expect(unitVisualActivity(apartment, clock(1, 21, 59), NO_VISITORS)).toBe('occupied')
    expect(unitVisualActivity(apartment, clock(1, 22), NO_VISITORS)).toBe('sleeping')
    expect(unitVisualActivity(apartment, clock(2, 5, 59), NO_VISITORS)).toBe('sleeping')
  })

  it('lights commerce only while a visitor is dwelling there', () => {
    const fastFood = occupiedUnit('fastfood', 42)

    expect(unitVisualActivity(fastFood, clock(1, 12), NO_VISITORS)).toBe('vacant')
    expect(unitVisualActivity(fastFood, clock(1, 12), new Set([42]))).toBe('occupied')
  })

  it('keeps unavailable units visually empty regardless of schedule', () => {
    const office = occupiedUnit('officeS')
    office.offline = true
    expect(unitVisualActivity(office, clock(1, 10), NO_VISITORS)).toBe('vacant')

    office.offline = false
    office.infested = true
    expect(unitVisualActivity(office, clock(1, 10), NO_VISITORS)).toBe('vacant')
  })

  it('shows restroom activity during waking hours without changing service occupancy', () => {
    const restroom = occupiedUnit('restroom')
    restroom.occupied = false

    expect(unitVisualActivity(restroom, clock(1, 5, 59), NO_VISITORS)).toBe('vacant')
    expect(unitVisualActivity(restroom, clock(1, 12), NO_VISITORS)).toBe('occupied')
    expect(unitVisualActivity(restroom, clock(1, 22), NO_VISITORS)).toBe('vacant')

    restroom.offline = true
    expect(unitVisualActivity(restroom, clock(1, 12), NO_VISITORS)).toBe('vacant')
  })
})
