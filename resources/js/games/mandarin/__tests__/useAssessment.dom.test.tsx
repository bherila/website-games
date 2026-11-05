import { act, renderHook } from '@testing-library/react'
import { type PropsWithChildren, startTransition, StrictMode } from 'react'

import type { PracticeEvent } from '../contracts/mandarin'
import { loadCourse } from '../domain/course'
import type { EventContext } from '../domain/events'
import type { ActiveAssessment, GameApi } from '../ui/GameContext'
import { useAssessment } from '../ui/useAssessment'

let gameApi: Pick<GameApi, 'eventContext' | 'appendEvents' | 'registerAssessment'>
jest.mock('../ui/GameContext', () => ({ useGame: () => gameApi }))

const course = loadCourse()
const exercise = course.exerciseById.get('e001')!
const location = { sceneId: 's1', nodeId: 's1n1' }

function StrictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>
}

function makeGame(schemaVersion: 1 | 2 = 2) {
  const events: PracticeEvent[] = []
  const unregister = jest.fn()
  const registerAssessment = jest.fn((_entry: ActiveAssessment) => unregister)
  const appendEvents = jest.fn((batch: PracticeEvent[]) => { events.push(...batch) })
  const eventContext: EventContext = {
    identity: course.identity,
    clientInstanceId: 'assessment-test',
    sessionId: 'assessment-session',
    schemaVersion,
    now: () => '2026-01-01T00:00:00.000Z',
  }
  gameApi = { eventContext, registerAssessment, appendEvents }
  return { events, appendEvents, registerAssessment, unregister }
}

function openAssessment(schemaVersion: 1 | 2 = 2) {
  const game = makeGame(schemaVersion)
  const view = renderHook(() => useAssessment(exercise, 'review', location, 'continuation'), { wrapper: StrictWrapper })
  return { ...game, ...view }
}

it.each([1, 2] as const)('emits one schema-v%i answer for one accepted submit under StrictMode', (schemaVersion) => {
  const { result, events, appendEvents, rerender } = openAssessment(schemaVersion)
  const opportunityId = result.current.state.opportunityId
  act(() => {
    result.current.dispatch({ type: 'playback', variant: 'normal', outcome: 'completed' })
    result.current.dispatch({ type: 'select', optionId: exercise.correctOptionId })
    result.current.dispatch({ type: 'submit' })
  })

  expect(result.current.state.attempts).toHaveLength(1)
  expect(result.current.state.phase).toBe('feedback')
  expect(appendEvents).toHaveBeenCalledTimes(1)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    schemaVersion, kind: 'response', opportunityId,
    responseAction: 'answer', selectedOptionId: exercise.correctOptionId,
    textHelpUsed: false, pinyinHelpUsed: false,
    audioEvidence: { status: 'completed', normalPlayCount: 1, slowPlayCount: 0, interrupted: false },
  })
  if (schemaVersion === 2) expect(events[0]).toMatchObject({ attemptIndex: 0, sessionKind: 'continuation' })
  else expect(events[0]).not.toHaveProperty('attemptIndex')
  const original = JSON.stringify(events)
  rerender()
  expect(JSON.stringify(events)).toBe(original)
  expect(result.current.state.opportunityId).toBe(opportunityId)
})

it('keeps help and response order when several inputs arrive before rendering, ignoring no-op repeats', () => {
  const { result, events } = openAssessment()
  act(() => {
    result.current.dispatch({ type: 'submit' }) // no selected answer
    result.current.dispatch({ type: 'playback', variant: 'normal', outcome: 'completed' })
    result.current.dispatch({ type: 'reveal', kind: 'pinyin' })
    result.current.dispatch({ type: 'reveal', kind: 'pinyin' })
    result.current.dispatch({ type: 'select', optionId: exercise.correctOptionId })
    result.current.dispatch({ type: 'submit' })
    result.current.dispatch({ type: 'submit' })
    result.current.dispatch({ type: 'dontKnow' }) // feedback is already shown
  })
  expect(events.map((event) => event.kind)).toEqual(['help_revealed', 'response'])
  expect(events.every((event) => event.pinyinHelpUsed)).toBe(true)
  expect(new Set(events.map((event) => event.opportunityId))).toEqual(new Set([result.current.state.opportunityId]))
  expect(new Set(events.map((event) => event.clientEventId)).size).toBe(2)
  expect(result.current.state.attempts).toHaveLength(1)
})

it.each([1, 2] as const)('retains schema-v%i retry evidence and event order across a batched retry', (schemaVersion) => {
  const { result, events } = openAssessment(schemaVersion)
  const wrong = exercise.options.find((option) => option.id !== exercise.correctOptionId)!.id
  act(() => {
    result.current.dispatch({ type: 'playback', variant: 'normal', outcome: 'completed' })
    result.current.dispatch({ type: 'select', optionId: wrong })
    result.current.dispatch({ type: 'submit' })
    result.current.dispatch({ type: 'retry' })
    result.current.dispatch({ type: 'select', optionId: exercise.correctOptionId })
    result.current.dispatch({ type: 'submit' })
  })
  expect(events.map((event) => event.selectedOptionId)).toEqual([wrong, exercise.correctOptionId])
  expect(events.map((event) => event.textHelpUsed)).toEqual([false, schemaVersion === 1])
  if (schemaVersion === 2) expect(events.map((event) => event.attemptIndex)).toEqual([0, 1])
  expect(events[0]?.opportunityId).toBe(events[1]?.opportunityId)
  expect(events[0]?.clientEventId).not.toBe(events[1]?.clientEventId)
  expect(result.current.state.attempts).toHaveLength(2)
  expect(result.current.state.attempts[1]?.isRetry).toBe(true)
})

it('emits once when a transition is followed by urgent input before the pending render commits', () => {
  const { result, events } = openAssessment()
  const wrong = exercise.options.find((option) => option.id !== exercise.correctOptionId)!.id
  act(() => {
    startTransition(() => {
      result.current.dispatch({ type: 'select', optionId: wrong })
      result.current.dispatch({ type: 'submit' })
    })
    result.current.dispatch({ type: 'retry' })
    result.current.dispatch({ type: 'select', optionId: exercise.correctOptionId })
    result.current.dispatch({ type: 'submit' })
  })
  expect(events.map((event) => event.selectedOptionId)).toEqual([wrong, exercise.correctOptionId])
  expect(result.current.state.attempts).toHaveLength(2)
  expect(result.current.state.submittedOptionId).toBe(exercise.correctOptionId)
})

it('records dont-know and skip once and ignores callbacks retained after unmount', () => {
  const { result, events, unmount } = openAssessment()
  const dispatch = result.current.dispatch
  act(() => {
    dispatch({ type: 'dontKnow' })
    dispatch({ type: 'dontKnow' })
    dispatch({ type: 'retry' })
    dispatch({ type: 'skip' })
    dispatch({ type: 'skip' })
  })
  expect(events.map((event) => event.responseAction)).toEqual(['dont_know', 'skip'])
  expect(result.current.state.attempts).toHaveLength(2)
  unmount()
  const before = JSON.stringify(events)
  act(() => {
    dispatch({ type: 'reveal', kind: 'meaning' })
    dispatch({ type: 'retry' })
    dispatch({ type: 'dontKnow' })
  })
  expect(JSON.stringify(events)).toBe(before)
})

it('unregisters old glossary help on unmount and keeps the next opportunity independent', () => {
  const { result, events, registerAssessment, unregister, unmount } = openAssessment()
  const opportunityId = result.current.state.opportunityId
  const oldHelp = registerAssessment.mock.calls.at(-1)![0].revealMeaning
  act(() => oldHelp())
  expect(events).toHaveLength(1)
  unmount()
  expect(unregister).toHaveBeenCalledTimes(registerAssessment.mock.calls.length)

  const next = openAssessment()
  expect(next.result.current.state.opportunityId).not.toBe(opportunityId)
  act(() => oldHelp())
  expect(events).toHaveLength(1)
  expect(next.events).toHaveLength(0)
})
