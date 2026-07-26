import type { EngineEvent, Unit } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { CITY_TOWER } from '../maps'
import { applyStarLoss, applyStarUp, populationOf, starUpArmed, unlockedKindsAt } from '../stars'
import { makeTestState, setStars } from './testState'

function unitWithPopulation(population: Unit['population']): Unit {
  return {
    id: 1,
    kind: 'officeS',
    floor: 0,
    x: 0,
    width: 6,
    storeys: 1,
    grade: 'standard',
    rentTier: 'avg',
    occupied: true,
    population,
    evalScore: 0,
    stressMarks: 0,
    lowEvalDays: 0,
    vacancyReason: null,
    flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: false },
    dirty: false,
    infested: false,
    offline: false,
    damageKind: null,
    incidentPenaltyUntilDay: null,
  }
}

describe('populationOf & thresholds', () => {
  it('sums population tiers across units', () => {
    const state = makeTestState({ units: [unitWithPopulation({ low: 100, med: 100, high: 50, vip: 50 })] })
    expect(populationOf(state)).toBe(300)
  })

  it('arms the next star at the population threshold', () => {
    const armed = makeTestState({ units: [unitWithPopulation({ low: 300, med: 0, high: 0, vip: 0 })] })
    expect(starUpArmed(armed)).toBe(true)
    expect(TUNING.stars.popThresholds[2]).toBe(300)

    const short = makeTestState({ units: [unitWithPopulation({ low: 299, med: 0, high: 0, vip: 0 })] })
    expect(starUpArmed(short)).toBe(false)
  })

  it('never arms past 5★', () => {
    const state = makeTestState({ units: [unitWithPopulation({ low: 99_999, med: 0, high: 0, vip: 0 })] })
    setStars(state, 5, 5)
    expect(starUpArmed(state)).toBe(false)
  })
})

describe('applyStarUp', () => {
  it('increments star, grants the bonus, and reports the newly unlocked kinds', () => {
    const state = makeTestState()
    const fundsBefore = state.funds
    const events: EngineEvent[] = []
    applyStarUp(state, events)

    expect(state.star).toBe(2)
    expect(state.maxStarReached).toBe(2)

    const bonus = TUNING.economy.starUpBonusPerStar * 2
    expect(state.funds).toBe(fundsBefore + bonus)
    expect(state.ledgerToday.lines['bonus.star']).toBe(bonus)

    const starUp = events.find((e) => e.type === 'starUp')
    expect(starUp).toMatchObject({ type: 'starUp', star: 2, bonus })
    // 2★ unlocks include office M / escalator but not the already-available office S.
    if (starUp?.type === 'starUp') {
      expect(starUp.unlocked).toEqual(expect.arrayContaining(['officeM', 'escalator']))
      expect(starUp.unlocked).not.toContain('officeS')
    }

    expect(events).toContainEqual({ type: 'milestone', milestone: 'star2' })
    expect(state.milestonesEarned).toContain('star2')
  })
})

describe('applyStarLoss', () => {
  it('decrements star but preserves maxStarReached', () => {
    const state = makeTestState()
    setStars(state, 3, 3)
    const events: EngineEvent[] = []
    applyStarLoss(state, ['VIP moved out'], events)

    expect(state.star).toBe(2)
    expect(state.maxStarReached).toBe(3)
    expect(events).toContainEqual({ type: 'starLost', star: 2, report: ['VIP moved out'] })
  })
})

describe('unlockedKindsAt', () => {
  it('is monotonic across stars', () => {
    const at1 = new Set(unlockedKindsAt(1, CITY_TOWER))
    const at3 = unlockedKindsAt(3, CITY_TOWER)
    for (const kind of at1) {
      expect(at3).toContain(kind)
    }
    expect(at3.length).toBeGreaterThan(at1.size)
  })
})
