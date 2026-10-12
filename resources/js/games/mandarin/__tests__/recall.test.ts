import { parseCourse } from '../domain/courseSchema'
import { createInitialProgress } from '../domain/progress'
import { buildScheduledReview } from '../domain/reviewSession'
import { buildCardSchedules } from '../domain/scheduler'
import { recallCourse } from './recallFixture'

const course = recallCourse()
const key = (id: string) => `utterance:${id}#form.recall`

describe('spoken recall course and reviews', () => {
  it('uses five already taught construction sentences, with separate utterance card keys', () => {
    expect(course.recallById.size).toBe(5)
    expect(course.course.schemaVersion).toBe(2)
    for (const recall of course.recallById.values()) {
      expect(course.reservedUtteranceIds.has(recall.sourceUtteranceId)).toBe(false)
      expect(course.utteranceById.get(recall.sourceUtteranceId)?.en).toBe(recall.cueEn)
    }
    expect(() => parseCourse({ ...course.course, schemaVersion: 1 })).toThrow()
    const invalid = structuredClone(course.course)
    invalid.recallExercises![0]!.assesses.id = '02c'
    expect(() => parseCourse(invalid)).toThrow(/assesses a different utterance/)
  })

  it('offers at most two new cards after due cards, and none from untaught nodes', () => {
    const progress = { ...createInitialProgress(course), completedNodeIds: course.nodes.map((node) => node.id) }
    const plan = buildScheduledReview(course, progress, ['hello'], 10, { dueCardKeys: ['target:hello#listen.meaning'], reviewedCardKeys: [] })
    expect(plan.items.map((item) => item.exercise.kind)).toEqual(['audio_choice', 'say_check', 'say_check'])
    expect(plan.items.slice(1).map((item) => item.cardKey)).toEqual([key('01f'), key('02c')])
    const presented = new Set(plan.items.map((item) => item.cardKey))
    const next = buildScheduledReview(course, progress, [], 10, { dueCardKeys: [], reviewedCardKeys: [], presentedCardKeys: presented })
    expect(next.items.map((item) => item.cardKey)).toEqual([key('03f'), key('04d')])
    expect(buildScheduledReview(course, createInitialProgress(course), [], 10, { dueCardKeys: [], reviewedCardKeys: [] }).items).toEqual([])
  })

  it('mixes due listening and recall cards in the supplied due order and excludes retired cards', () => {
    const progress = { ...createInitialProgress(course), completedNodeIds: course.nodes.map((node) => node.id) }
    const plan = buildScheduledReview(course, progress, ['hello'], 10, {
      dueCardKeys: [key('01f'), 'target:hello#listen.meaning', key('retired')],
      reviewedCardKeys: [...course.recallById.values()].map((item) => key(item.assesses.id)),
    })
    expect(plan.items.map((item) => item.cardKey)).toEqual([key('01f'), 'target:hello#listen.meaning'])
  })

  it('caps self-rated recall at seven days without changing listening intervals', () => {
    const reviews = [0, 2, 13].flatMap((day, index) => [
      { targetId: 'hello', cardKey: 'target:hello#listen.meaning', grade: 'Good' as const, scheduleEligible: true, acceptedAt: new Date(Date.UTC(2026, 9, 1 + day)).toISOString(), sequence: index * 2 + 1 },
      { targetId: null, cardKey: key('01f'), grade: 'Good' as const, scheduleEligible: true, acceptedAt: new Date(Date.UTC(2026, 9, 1 + day)).toISOString(), sequence: index * 2 + 2 },
    ])
    const schedules = buildCardSchedules(reviews, 10)
    expect(schedules.get(key('01f'))?.effectiveDue.toISOString()).toBe('2026-10-21T00:00:00.000Z')
    expect(schedules.get('target:hello#listen.meaning')?.effectiveDue.toISOString()).toBe('2026-11-29T00:00:00.000Z')
  })
})
