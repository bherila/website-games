/** Event building: the assistance flags a response carries are what the scheduler grades on. */
import { createAssessment, reduceAssessment } from '../domain/assessment'
import { constructionEvent, helpRevealedEvent, responseEvent, teachingExposureEvent } from '../domain/events'

const EXERCISE = { id: 'e001', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], shuffleOptions: false }
const CONTEXT = {
  identity: { courseId: 'c', contentVersion: '1.1.1' },
  clientInstanceId: 'inst',
  sessionId: 'sess',
  now: () => '2026-01-01T00:00:00.000Z',
}
const WHERE = { sceneId: 's1', nodeId: 's1n1' }

function submit(state: ReturnType<typeof createAssessment>, optionId: string) {
  return reduceAssessment(reduceAssessment(state, { type: 'select', optionId }, 'a'), { type: 'submit' }, 'a')
}

describe('responseEvent assistance flags', () => {
  it('keeps queued v1 payloads intact while newly built v2 responses separate retries from help', () => {
    const first = submit(createAssessment(EXERCISE, 'opp', 'lesson'), 'b')
    const legacy = responseEvent(CONTEXT, first, WHERE, null)
    const frozen = JSON.stringify(legacy)
    const retried = submit(reduceAssessment(first, { type: 'retry' }, 'a'), 'a')
    const v2 = responseEvent({ ...CONTEXT, schemaVersion: 2 }, retried, WHERE, null)
    expect(v2).toMatchObject({ schemaVersion: 2, attemptIndex: 1, textHelpUsed: false, selfRating: null, sessionKind: null })
    expect(responseEvent(CONTEXT, retried, WHERE, null).textHelpUsed).toBe(true)
    expect(legacy).not.toHaveProperty('attemptIndex')
    expect(legacy).not.toHaveProperty('sessionKind')
    expect(JSON.stringify(legacy)).toBe(frozen)
  })

  it('uses the same reveal-only meaning on v2 response and help events', () => {
    const retry = reduceAssessment(submit(createAssessment(EXERCISE, 'opp', 'lesson'), 'b'), { type: 'retry' }, 'a')
    const context = { ...CONTEXT, schemaVersion: 2 as const }
    const pinyin = reduceAssessment(retry, { type: 'reveal', kind: 'pinyin' }, 'a')
    expect(helpRevealedEvent(context, pinyin, WHERE)).toMatchObject({ textHelpUsed: false, pinyinHelpUsed: true })
    const meaning = reduceAssessment(pinyin, { type: 'reveal', kind: 'meaning' }, 'a')
    expect(helpRevealedEvent(context, meaning, WHERE).textHelpUsed).toBe(true)
    expect(responseEvent(context, submit(meaning, 'a'), WHERE, null).textHelpUsed).toBe(true)
  })

  it.each(['scheduled', 'continuation'] as const)('labels %s review responses', (sessionKind) => {
    const answered = submit(createAssessment(EXERCISE, 'opp', 'review'), 'a')
    expect(responseEvent({ ...CONTEXT, schemaVersion: 2, sessionKind }, answered, WHERE, null).sessionKind).toBe(sessionKind)
    const extra = submit(createAssessment(EXERCISE, 'opp', 'extra_practice'), 'a')
    expect(responseEvent({ ...CONTEXT, schemaVersion: 2 }, extra, WHERE, null).sessionKind).toBe('extra')
  })

  it('builds valid v2 construction responses and non-response events', () => {
    const context = { ...CONTEXT, schemaVersion: 2 as const }
    expect(constructionEvent(context, 'lesson', { ...WHERE, exerciseId: 'g01' }, ['tile'])).toMatchObject({ schemaVersion: 2, attemptIndex: 0, opportunityId: expect.any(String), sessionKind: null })
    expect(teachingExposureEvent(context, 's1', 's1n1').schemaVersion).toBe(2)
  })

  it('does not mark a first, unaided answer as text-assisted', () => {
    // Regression: `submit` sets `answerDisclosed` itself, so reading that flag from
    // the post-action state graded every correct answer as if help had been used.
    const answered = submit(createAssessment(EXERCISE, 'opp', 'lesson'), 'a')
    const event = responseEvent(CONTEXT, answered, WHERE, null)
    expect(event.textHelpUsed).toBe(false)
    expect(event.pinyinHelpUsed).toBe(false)
  })

  it('marks a retry after feedback as text-assisted', () => {
    const retried = submit(reduceAssessment(submit(createAssessment(EXERCISE, 'opp', 'lesson'), 'b'), { type: 'retry' }, 'a'), 'a')
    expect(responseEvent(CONTEXT, retried, WHERE, null).textHelpUsed).toBe(true)
  })

  it('marks an answer as text-assisted after the glossary reveals a meaning', () => {
    const helped = submit(reduceAssessment(createAssessment(EXERCISE, 'opp', 'lesson'), { type: 'reveal', kind: 'meaning' }, 'a'), 'a')
    expect(responseEvent(CONTEXT, helped, WHERE, null).textHelpUsed).toBe(true)
  })

  it('keeps pinyin help separate from text help', () => {
    const helped = submit(reduceAssessment(createAssessment(EXERCISE, 'opp', 'lesson'), { type: 'reveal', kind: 'pinyin' }, 'a'), 'a')
    const event = responseEvent(CONTEXT, helped, WHERE, null)
    expect(event.textHelpUsed).toBe(false)
    expect(event.pinyinHelpUsed).toBe(true)
  })
})
