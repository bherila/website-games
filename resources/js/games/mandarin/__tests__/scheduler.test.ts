import { buildSchedules, dueTargetIds, dueTargetIdsFromProjection, type GradedReview } from '../domain/scheduler'

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
    const log = [review('hello', 'Again', 0, 1)]
    const schedule = buildSchedules(log, 10).get('hello')!
    expect(schedule.effectiveDue.getTime()).toBeGreaterThanOrEqual(t0.getTime() + 10 * 60_000)
    expect(dueTargetIds(log, 10, new Date(t0.getTime() + 5 * 60_000))).toEqual([])
    expect(dueTargetIds(log, 10, new Date(t0.getTime() + 11 * 60_000))).toEqual(['hello'])
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
    expect(dueTargetIdsFromProjection(projection, new Date(t0.getTime() + 60 * 60_000))).toEqual(['hello'])
    expect(dueTargetIdsFromProjection({ listeningCards: {} }, t0)).toEqual([])
    expect(dueTargetIdsFromProjection({ listeningCards: { kind: 'something-else' } }, t0)).toEqual([])
  })
})
