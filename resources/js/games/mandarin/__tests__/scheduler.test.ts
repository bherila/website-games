import { State } from 'ts-fsrs'

import { buildSchedules, dueTargetIds, dueTargetIdsFromProjection, type GradedReview, isSchedulerOutdated, LEARNING_STEPS, RELEARNING_STEPS, SCHEDULER_VERSION } from '../domain/scheduler'

const t0 = new Date('2026-09-06T10:00:00.000Z')
const at = (minutes: number): string => new Date(t0.getTime() + minutes * 60_000).toISOString()

function review(targetId: string, grade: GradedReview['grade'], minutes: number, sequence: number, scheduleEligible = true): GradedReview {
  return { targetId, grade, scheduleEligible, acceptedAt: at(minutes), sequence }
}

describe('listening scheduler projection', () => {
  it('is deterministic and ignores ineligible reviews', () => {
    const log = [review('hello', 'Good', 0, 1), review('hello', 'Good', 1, 2, false), review('be', 'Again', 2, 3)]
    const a = buildSchedules(log, 10)
    const b = buildSchedules(log, 10)
    expect(a.get('hello')?.card.due.toISOString()).toBe(b.get('hello')?.card.due.toISOString())
    expect(a.get('hello')?.reviews).toBe(1)
    expect(a.get('be')?.reviews).toBe(1)
  })

  it('never makes a target due before the end of its window', () => {
    // A three-day window is longer than FSRS's first interval after Again, so the floor applies.
    const window = 3 * 24 * 60
    const log = [review('hello', 'Again', 0, 1)]
    const schedule = buildSchedules(log, window).get('hello')!
    expect(schedule.card.due.getTime()).toBeLessThan(t0.getTime() + window * 60_000)
    expect(schedule.effectiveDue.getTime()).toBe(t0.getTime() + window * 60_000)
    expect(dueTargetIds(log, window, new Date(t0.getTime() + (window - 1) * 60_000))).toEqual([])
    expect(dueTargetIds(log, window, new Date(t0.getTime() + (window + 1) * 60_000))).toEqual(['hello'])
  })

  // #107: with ts-fsrs's default learning steps, Hard kept a card in Learning every few minutes forever.
  it('graduates a new card rated Hard repeatedly, with growing intervals', () => {
    const day = 24 * 60
    const log: GradedReview[] = []
    let now = 0
    let previousGap = 0
    for (let i = 1; i <= 4; i++) {
      log.push(review('hello', 'Hard', now, i))
      const schedule = buildSchedules(log, 10).get('hello')!
      expect(schedule.card.state).toBe(State.Review)
      const gap = (schedule.effectiveDue.getTime() - (t0.getTime() + now * 60_000)) / 60_000
      expect(gap).toBeGreaterThanOrEqual(day)
      expect(gap).toBeGreaterThanOrEqual(previousGap)
      previousGap = gap
      now += gap
    }
  })

  it('graduates a lapsed card rated Hard instead of looping in Relearning', () => {
    const day = 24 * 60
    const log = [review('hello', 'Good', 0, 1), review('hello', 'Good', 2 * day, 2), review('hello', 'Again', 13 * day, 3), review('hello', 'Hard', 15 * day, 4), review('hello', 'Hard', 19 * day, 5)]
    const schedule = buildSchedules(log, 10).get('hello')!
    expect(schedule.card.state).toBe(State.Review)
    expect(schedule.effectiveDue.getTime() - (t0.getTime() + 19 * day * 60_000)).toBeGreaterThanOrEqual(day * 60_000)
  })

  it('names the step policy in the scheduler version, so replays under different steps are distinguishable', () => {
    const policy = LEARNING_STEPS.length === 0 && RELEARNING_STEPS.length === 0 ? 'steps-none' : 'steps-custom'
    expect(SCHEDULER_VERSION).toBe(`ts-fsrs-5.4.2+${policy}`)
  })

  it('keeps the Good path: about 2, then 11, then 46 days', () => {
    const day = 24 * 60
    const log = [review('hello', 'Good', 0, 1)]
    const gaps: number[] = []
    let now = 0
    for (let i = 2; i <= 4; i++) {
      const due = buildSchedules(log, 10).get('hello')!.effectiveDue.getTime()
      const gap = Math.round((due - (t0.getTime() + now * 60_000)) / 60_000 / day)
      gaps.push(gap)
      now += gap * day
      log.push(review('hello', 'Good', now, i))
    }
    expect(gaps).toEqual([2, 11, 46])
  })

  it('orders due targets soonest first and a well-known card is due later than a lapsed one', () => {
    const log = [review('hello', 'Good', 0, 1), review('hello', 'Good', 20, 2), review('hello', 'Good', 24 * 60, 3), review('be', 'Again', 24 * 60, 4)]
    const schedules = buildSchedules(log, 10)
    expect(schedules.get('hello')!.effectiveDue.getTime()).toBeGreaterThan(schedules.get('be')!.effectiveDue.getTime())
    const later = new Date(t0.getTime() + 30 * 24 * 60 * 60_000)
    expect(dueTargetIds(log, 10, later)).toEqual(['be', 'hello'])
  })

  it('reads the server projection shape and tolerates unknown shapes', () => {
    const projection = { listeningCards: { kind: 'graded-review-log', windowMinutes: 10, reviews: [{ targetId: 'hello', grade: 'Again', acceptedAt: at(0), sequence: 1 }, { junk: true }] } }
    expect(dueTargetIdsFromProjection(projection, new Date(t0.getTime() + 2 * 24 * 60 * 60_000))).toEqual(['hello'])
    expect(dueTargetIdsFromProjection({ listeningCards: {} }, t0)).toEqual([])
    expect(dueTargetIdsFromProjection({ listeningCards: { kind: 'something-else' } }, t0)).toEqual([])
  })

  it('flags an account projection that names a different scheduler policy, and nothing else', () => {
    expect(isSchedulerOutdated({ schedulerVersion: SCHEDULER_VERSION }, true)).toBe(false)
    expect(isSchedulerOutdated({ schedulerVersion: 'ts-fsrs-5.4.2' }, true)).toBe(true)
    expect(isSchedulerOutdated(null, true)).toBe(false)
    // Guest and preview projections name no real scheduler.
    expect(isSchedulerOutdated({ schedulerVersion: 'guest' }, false)).toBe(false)
    expect(isSchedulerOutdated({ schedulerVersion: 'mock-preview-0' }, false)).toBe(false)
  })
})
