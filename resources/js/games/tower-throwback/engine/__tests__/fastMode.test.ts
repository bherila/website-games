import type { Person } from '../../gameTypes'
import { effectiveSpeed, isTowerLowActivity, stepEngine } from '../engine'
import { makeTestState } from './testState'

const NIGHT_MINUTE = 2 * 60 // 02:00 — a low-activity phase
const MORNING_RUSH_MINUTE = 7 * 60 // 07:00 — needs attention

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 1,
    tier: 'low',
    vip: false,
    state: 'walking',
    floor: 0,
    x: 100,
    patienceLeft: 60,
    irritated: false,
    legs: [],
    legIndex: 0,
    purpose: 'commuteIn',
    tenantUnitId: null,
    destUnitId: null,
    ...overrides,
  }
}

describe('effectiveSpeed — dynamic fast mode', () => {
  it('returns the selected speed when fast mode is off, even in a lull', () => {
    const state = makeTestState({ speed: 16, fastMode: false, clock: { day: 1, minute: NIGHT_MINUTE } })
    expect(effectiveSpeed(state)).toBe(16)
  })

  it('boosts 16× → 48× when fast mode is on and the tower is quiet', () => {
    const state = makeTestState({ speed: 16, fastMode: true, clock: { day: 1, minute: NIGHT_MINUTE } })
    expect(effectiveSpeed(state)).toBe(48)
  })

  it('boosts 8× → 24× (triples, capped at 48)', () => {
    const state = makeTestState({ speed: 8, fastMode: true, clock: { day: 1, minute: NIGHT_MINUTE } })
    expect(effectiveSpeed(state)).toBe(24)
  })

  it('does not boost below 8× (the player is watching closely)', () => {
    for (const speed of [1, 2, 4] as const) {
      const state = makeTestState({ speed, fastMode: true, clock: { day: 1, minute: NIGHT_MINUTE } })
      expect(effectiveSpeed(state)).toBe(speed)
    }
  })

  it('does not boost during a rush window', () => {
    const state = makeTestState({ speed: 16, fastMode: true, clock: { day: 1, minute: MORNING_RUSH_MINUTE } })
    expect(effectiveSpeed(state)).toBe(16)
  })
})

describe('isTowerLowActivity', () => {
  it('is true for a quiet non-rush tower', () => {
    expect(isTowerLowActivity(makeTestState({ clock: { day: 1, minute: NIGHT_MINUTE } }))).toBe(true)
  })

  it('is false during rush hours', () => {
    expect(isTowerLowActivity(makeTestState({ clock: { day: 1, minute: MORNING_RUSH_MINUTE } }))).toBe(false)
  })

  it('is false when someone is queued for an elevator', () => {
    const state = makeTestState({
      clock: { day: 1, minute: NIGHT_MINUTE },
      people: [person({ state: 'queued' })],
    })
    expect(isTowerLowActivity(state)).toBe(false)
  })

  it('is false when a VIP is in the building', () => {
    const state = makeTestState({
      clock: { day: 1, minute: NIGHT_MINUTE },
      people: [person({ vip: true })],
    })
    expect(isTowerLowActivity(state)).toBe(false)
  })

  it('is false while an incident is active', () => {
    const state = makeTestState({
      clock: { day: 1, minute: NIGHT_MINUTE },
      activeBombThreat: { kind: 'bombThreat', floor: 2, x: 105, sweepRemainingMin: null, ransom: 10_000 },
    })
    expect(isTowerLowActivity(state)).toBe(false)
  })

  it('is false when the population is large even mid-day', () => {
    const crowd = Array.from({ length: 60 }, (_, i) => person({ id: i + 1 }))
    const state = makeTestState({ clock: { day: 1, minute: NIGHT_MINUTE }, people: crowd })
    expect(isTowerLowActivity(state)).toBe(false)
  })
})

describe('fast mode determinism', () => {
  it('two identical fast-forward runs stay byte-identical', () => {
    const run = (): { minute: number; day: number; funds: number } => {
      const state = makeTestState({ seed: 7, speed: 16, fastMode: true, clock: { day: 1, minute: NIGHT_MINUTE } })
      for (let i = 0; i < 200; i++) {
        stepEngine(state, [], 1 / 30)
      }
      return { minute: state.clock.minute, day: state.clock.day, funds: state.funds }
    }
    expect(run()).toEqual(run())
  })
})
