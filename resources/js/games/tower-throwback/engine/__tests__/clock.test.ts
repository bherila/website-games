import type { DayPhase } from '../../gameTypes'
import { defaultShaftProgram } from '../../gameTypes'
import { advanceClock, directionPriorityFor, isWeekend, phaseOf, programSlotFor } from '../clock'
import { makeTestState } from './testState'

describe('phaseOf', () => {
  const cases: Array<[string, number, DayPhase]> = [
    ['00:00', 0, 'night'],
    ['05:59', 359, 'night'],
    ['06:00', 360, 'morningRush'],
    ['09:29', 569, 'morningRush'],
    ['09:30', 570, 'day'],
    ['11:29', 689, 'day'],
    ['11:30', 690, 'lunch'],
    ['13:29', 809, 'lunch'],
    ['13:30', 810, 'afternoon'],
    ['16:59', 1019, 'afternoon'],
    ['17:00', 1020, 'eveningRush'],
    ['18:59', 1139, 'eveningRush'],
    ['19:00', 1140, 'evening'],
    ['21:59', 1319, 'evening'],
    ['22:00', 1320, 'night'],
    ['23:59', 1439, 'night'],
  ]
  it.each(cases)('%s → %s', (_label, minute, expected) => {
    expect(phaseOf(minute)).toBe(expected)
  })
})

describe('isWeekend', () => {
  it('marks days 6–7 of every week', () => {
    expect([1, 2, 3, 4, 5].some(isWeekend)).toBe(false)
    expect(isWeekend(6)).toBe(true)
    expect(isWeekend(7)).toBe(true)
    expect(isWeekend(8)).toBe(false)
    expect(isWeekend(13)).toBe(true)
    expect(isWeekend(14)).toBe(true)
    expect(isWeekend(15)).toBe(false)
  })
})

describe('advanceClock', () => {
  it('advances within a day without flags', () => {
    const state = makeTestState()
    state.clock = { day: 1, minute: 100 }
    expect(advanceClock(state, 60)).toEqual({ crossedMidnight: false, crossedHour08: false })
    expect(state.clock).toEqual({ day: 1, minute: 160 })
  })

  it('flags an 08:00 crossing, including landing exactly on it', () => {
    const state = makeTestState()
    state.clock = { day: 1, minute: 470 }
    expect(advanceClock(state, 10)).toEqual({ crossedMidnight: false, crossedHour08: true })
    expect(state.clock.minute).toBe(480)
    // Already past 08:00 → no re-fire.
    expect(advanceClock(state, 10).crossedHour08).toBe(false)
  })

  it('flags midnight and rolls the day', () => {
    const state = makeTestState()
    state.clock = { day: 1, minute: 1430 }
    expect(advanceClock(state, 20)).toEqual({ crossedMidnight: true, crossedHour08: false })
    expect(state.clock).toEqual({ day: 2, minute: 10 })
  })

  it('handles a multi-day jump defensively', () => {
    const state = makeTestState()
    state.clock = { day: 1, minute: 600 }
    expect(advanceClock(state, 2 * 1440)).toEqual({ crossedMidnight: true, crossedHour08: true })
    expect(state.clock).toEqual({ day: 3, minute: 600 })
  })

  it('a one-day jump catches 08:00 on either side of midnight', () => {
    const state = makeTestState()
    state.clock = { day: 1, minute: 1000 } // past 08:00 already
    // 1000 → next day 900: crosses the new day's 08:00.
    expect(advanceClock(state, 1340)).toEqual({ crossedMidnight: true, crossedHour08: true })
    state.clock = { day: 3, minute: 400 } // before 08:00
    // 400 → next day 100: crossed day 3's 08:00 on the way out.
    expect(advanceClock(state, 1140)).toEqual({ crossedMidnight: true, crossedHour08: true })
    state.clock = { day: 5, minute: 1400 }
    // 1400 → next day 200: no 08:00 in the window.
    expect(advanceClock(state, 240)).toEqual({ crossedMidnight: true, crossedHour08: false })
  })

  it('ignores non-positive advances', () => {
    const state = makeTestState()
    state.clock = { day: 2, minute: 500 }
    expect(advanceClock(state, 0)).toEqual({ crossedMidnight: false, crossedHour08: false })
    expect(state.clock).toEqual({ day: 2, minute: 500 })
  })
})

describe('program slots', () => {
  it('maps clock → slot via the phase table', () => {
    expect(programSlotFor({ day: 1, minute: 400 })).toBe('morningRush')
    expect(programSlotFor({ day: 1, minute: 700 })).toBe('daytime')
    expect(programSlotFor({ day: 1, minute: 1050 })).toBe('eveningRush')
    expect(programSlotFor({ day: 1, minute: 1200 })).toBe('night')
  })

  it('directionPriorityFor picks the weekday/weekend program by day', () => {
    const program = defaultShaftProgram()
    program.weekday.morningRush = 'expressToTop'
    program.weekend.morningRush = 'expressToBottom'
    expect(directionPriorityFor(program, { day: 1, minute: 400 })).toBe('expressToTop')
    expect(directionPriorityFor(program, { day: 6, minute: 400 })).toBe('expressToBottom')
    expect(directionPriorityFor(program, { day: 6, minute: 700 })).toBe('balanced')
  })
})
