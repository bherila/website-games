import { assistanceLevel, audioEvidence, createAssessment, reduceAssessment, summarizeOpportunity } from '../domain/assessment'
import { loadCourse } from '../domain/course'
import { seededShuffle } from '../domain/random'

const course = loadCourse()
const exercise = course.exerciseById.get('e001')!

describe('assessment reducer', () => {
  it('shuffles options once per opportunity and keeps the order stable', () => {
    const a = createAssessment(exercise, 'opp-1', 'lesson')
    const b = createAssessment(exercise, 'opp-1', 'lesson')
    const c = createAssessment(exercise, 'opp-2', 'lesson')
    expect(a.optionOrder).toEqual(b.optionOrder)
    expect([...a.optionOrder].sort()).toEqual(exercise.options.map((option) => option.id).sort())
    const orders = new Set(['opp-1', 'opp-2', 'opp-3', 'opp-4', 'opp-5', 'opp-6'].map((id) => createAssessment(exercise, id, 'lesson').optionOrder.join(',')))
    expect(orders.size).toBeGreaterThan(1)
    expect(c.optionOrder).toEqual(seededShuffle(exercise.options.map((option) => option.id), 'opp-2'))
  })

  it('is unaided only for a first answer after one normal completed play', () => {
    let state = createAssessment(exercise, 'opp', 'lesson')
    state = reduceAssessment(state, { type: 'playback', variant: 'normal', outcome: 'completed' }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'select', optionId: exercise.correctOptionId }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'submit' }, exercise.correctOptionId)
    expect(state.phase).toBe('feedback')
    expect(state.attempts[0]).toMatchObject({ action: 'answer', correct: true, assistance: 'unaided', isRetry: false })
  })

  it('records replay, slow and text help as assistance', () => {
    const base = createAssessment(exercise, 'opp', 'lesson')
    const twice = reduceAssessment(reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'completed' }, 'x'), { type: 'playback', variant: 'normal', outcome: 'completed' }, 'x')
    expect(assistanceLevel(twice)).toBe('replay')
    const slow = reduceAssessment(reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'completed' }, 'x'), { type: 'playback', variant: 'slow', outcome: 'completed' }, 'x')
    expect(assistanceLevel(slow)).toBe('slow')
    const text = reduceAssessment(reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'completed' }, 'x'), { type: 'reveal', kind: 'transcript' }, 'x')
    expect(assistanceLevel(text)).toBe('text')
  })

  it('is unscored when no real audio completed (simulated / failed / none)', () => {
    const base = createAssessment(exercise, 'opp', 'lesson')
    expect(assistanceLevel(base)).toBe('unscored')
    const simulated = reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'simulated' }, 'x')
    expect(assistanceLevel(simulated)).toBe('unscored')
    expect(audioEvidence(simulated).status).toBe('simulated')
    const failed = reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'failed' }, 'x')
    expect(audioEvidence(failed).status).toBe('failed')
    const interrupted = reduceAssessment(reduceAssessment(base, { type: 'playback', variant: 'normal', outcome: 'completed' }, 'x'), { type: 'playback', variant: 'normal', outcome: 'interrupted' }, 'x')
    expect(audioEvidence(interrupted)).toMatchObject({ status: 'completed', interrupted: true, normalPlayCount: 1 })
  })

  it('keeps hint and replay evidence across feedback and retry; a retry is never unaided', () => {
    const wrong = exercise.options.find((option) => option.id !== exercise.correctOptionId)!.id
    let state = createAssessment(exercise, 'opp', 'lesson')
    state = reduceAssessment(state, { type: 'playback', variant: 'normal', outcome: 'completed' }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'reveal', kind: 'pinyin' }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'select', optionId: wrong }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'submit' }, exercise.correctOptionId)
    expect(state.submittedOptionId).toBe(wrong)
    const optionOrder = state.optionOrder
    state = reduceAssessment(state, { type: 'retry' }, exercise.correctOptionId)
    expect(state.phase).toBe('listening')
    expect(state.opportunityId).toBe('opp')
    expect(state.optionOrder).toEqual(optionOrder)
    expect(state.helpRevealed).toEqual(['pinyin'])
    expect(state.normalPlayCount).toBe(1)
    state = reduceAssessment(state, { type: 'select', optionId: exercise.correctOptionId }, exercise.correctOptionId)
    state = reduceAssessment(state, { type: 'submit' }, exercise.correctOptionId)
    expect(state.attempts).toHaveLength(2)
    expect(state.attempts[1]).toMatchObject({ correct: true, isRetry: true })
    expect(state.attempts[1]!.assistance).not.toBe('unaided')
    const outcome = summarizeOpportunity(reduceAssessment(state, { type: 'finish' }, exercise.correctOptionId))
    expect(outcome).toMatchObject({ attempts: 2, resolvedCorrect: true, helpUsed: true })
    expect(outcome.firstAttempt?.correct).toBe(false)
  })

  it('distinguishes dont_know and skip from a wrong answer', () => {
    const base = createAssessment(exercise, 'opp', 'lesson')
    const dontKnow = reduceAssessment(base, { type: 'dontKnow' }, exercise.correctOptionId)
    expect(dontKnow.attempts[0]).toMatchObject({ action: 'dont_know', optionId: null })
    const skip = reduceAssessment(base, { type: 'skip' }, exercise.correctOptionId)
    expect(skip.attempts[0]).toMatchObject({ action: 'skip', optionId: null })
  })
})
