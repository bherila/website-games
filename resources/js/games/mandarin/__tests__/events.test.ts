/** Event building: the assistance flags a response carries are what the scheduler grades on. */
import { createAssessment, reduceAssessment } from '../domain/assessment'
import { responseEvent } from '../domain/events'

const EXERCISE = { id: 'e001', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], shuffleOptions: false }
const CONTEXT = {
  identity: { courseId: 'c', contentVersion: '1.0.1' },
  clientInstanceId: 'inst',
  sessionId: 'sess',
  now: () => '2026-01-01T00:00:00.000Z',
}
const WHERE = { sceneId: 's1', nodeId: 's1n1' }

function submit(state: ReturnType<typeof createAssessment>, optionId: string) {
  return reduceAssessment(reduceAssessment(state, { type: 'select', optionId }, 'a'), { type: 'submit' }, 'a')
}

describe('responseEvent assistance flags', () => {
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
