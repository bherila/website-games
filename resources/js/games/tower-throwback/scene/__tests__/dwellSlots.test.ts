import { injectUnit, makeTestState } from '../../engine/__tests__/testState'
import { dwellRenderSlot, dwellSlotX, isDwellingVisitor } from '../dwellSlots'

describe('dwellSlotX', () => {
  it('is deterministic for a person and unit footprint', () => {
    expect(dwellSlotX(42, 10, 12)).toBe(dwellSlotX(42, 10, 12))
  })

  it('keeps slots inside the unit interior bounds', () => {
    for (const width of [1, 2, 6, 12]) {
      for (let id = 1; id <= 64; id += 1) {
        const x = dwellSlotX(id, 20, width)
        expect(x).toBeGreaterThanOrEqual(20.5)
        expect(x).toBeLessThanOrEqual(20 + Math.max(0.5, width - 0.5))
      }
    }
  })

  it('fans consecutive ids across distinct venue slots', () => {
    const slots = new Set(Array.from({ length: 16 }, (_, index) => dwellSlotX(index + 1, 5, 6)))

    expect(slots.size).toBeGreaterThanOrEqual(6)
  })
})

describe('dwellRenderSlot', () => {
  it('places Observation Deck visitors deterministically on the upper terrace', () => {
    const state = makeTestState({ mapId: 'niagara-falls' })
    const deck = injectUnit(state, { kind: 'observationDeck', floor: 15, x: 2, width: 24, storeys: 2 })

    const slot = dwellRenderSlot(42, deck)
    expect(slot).toEqual(dwellRenderSlot(42, deck))
    expect(slot.floor).toBe(16)
    expect(slot.x).toBeGreaterThanOrEqual(deck.x + 3.5)
    expect(slot.x).toBeLessThanOrEqual(deck.x + deck.width - 1)
  })

  it('keeps ordinary visitors on their destination floor', () => {
    const state = makeTestState()
    const restaurant = injectUnit(state, { kind: 'restaurant', floor: 8, x: 20, width: 10, storeys: 1 })
    expect(dwellRenderSlot(7, restaurant).floor).toBe(8)
  })
})

describe('isDwellingVisitor', () => {
  it('matches walking visitors whose route is complete and destination is still known', () => {
    expect(isDwellingVisitor({
      id: 1,
      tier: 'med',
      vip: false,
      state: 'walking',
      floor: 0,
      x: 0,
      patienceLeft: 60,
      irritated: false,
      legs: [],
      legIndex: 0,
      purpose: 'shopping',
      tenantUnitId: null,
      destUnitId: 99,
    })).toBe(true)
  })

  it('does not match queued/riding visitors, active walkers, or visitors without a destination', () => {
    const base = {
      id: 1,
      tier: 'med' as const,
      vip: false,
      floor: 0,
      x: 0,
      patienceLeft: 60,
      irritated: false,
      legs: [],
      legIndex: 0,
      purpose: 'shopping' as const,
      tenantUnitId: null,
      destUnitId: 99,
    }

    expect(isDwellingVisitor({ ...base, state: 'queued' })).toBe(false)
    expect(isDwellingVisitor({ ...base, state: 'riding' })).toBe(false)
    expect(isDwellingVisitor({ ...base, state: 'walking', legs: [{ type: 'walk', fromFloor: 0, fromX: 0, toFloor: 0, toX: 5 }] })).toBe(false)
    expect(isDwellingVisitor({ ...base, state: 'walking', destUnitId: null })).toBe(false)
  })
})
