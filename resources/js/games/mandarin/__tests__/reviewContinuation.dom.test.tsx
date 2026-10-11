/**
 * #106: "Another session" must continue into the backlog (distinct items),
 * a finished scheduled session must read progress back, and the review copy
 * must not talk about a mock scheduler.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { loadCourse } from '../domain/course'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

const course = loadCourse()

async function answerCurrent(): Promise<string> {
  const question = await screen.findByTestId('listening-question')
  const exerciseId = question.getAttribute('data-exercise-id')!
  const exercise = course.exerciseById.get(exerciseId)!
  const correct = within(question).getAllByTestId('answer-option').find((option) => option.getAttribute('data-option-id') === exercise.correctOptionId)!
  fireEvent.click(correct)
  fireEvent.click(within(question).getByTestId('check-answer'))
  await within(question).findByTestId('feedback')
  fireEvent.click(within(question).getByTestId('continue'))
  return exerciseId
}

async function runSession(size: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < size; i += 1) ids.push(await answerCurrent())
  await screen.findByTestId('review-complete')
  return ids
}

async function openReview() {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  const runtime = createPreviewRuntime({
    scenario: findPreviewScenario('returning'),
    store,
    speechSynthesis: null,
    sfx: NULL_SFX_PLAYER,
    channelDeps: { simulatedDurationMs: () => 1 },
    appendDelayMs: 0,
  })
  const getProgress = jest.spyOn(runtime.gateway, 'getProgress')
  render(<MandarinGame runtime={runtime} />)
  fireEvent.click(await screen.findByTestId('review-button'))
  const review = await screen.findByTestId('review-screen')
  return { runtime, getProgress, review }
}

describe('Mandarin review continuation (#106)', () => {
  it('starts a backlogged session of 10, then continues with the 2 remaining distinct items', async () => {
    const { runtime, review } = await openReview()
    expect(review).toHaveAttribute('data-review-state', 'backlogged')
    expect(screen.getByTestId('review-backlog')).toHaveTextContent('2 more due')

    const first = await runSession(10)
    expect(first).toHaveLength(10)

    fireEvent.click(screen.getByRole('button', { name: /another session/i }))
    const second = await runSession(2)
    expect(second).toHaveLength(2)
    for (const id of second) expect(first).not.toContain(id)
    expect(screen.queryByRole('button', { name: /another session/i })).toBeNull()
    runtime.dispose()
  })

  it('reads progress back after a scheduled session completes', async () => {
    const { runtime, getProgress } = await openReview()
    const callsBefore = getProgress.mock.calls.length
    await runSession(10)
    await waitFor(() => expect(getProgress.mock.calls.length).toBeGreaterThan(callsBefore))
    runtime.dispose()
  })

  it('never mentions a mock scheduler on the review screen', async () => {
    const { runtime, review } = await openReview()
    expect(review.textContent ?? '').not.toMatch(/mock/i)
    await runSession(10)
    expect(screen.getByTestId('review-screen').textContent ?? '').not.toMatch(/mock/i)
    runtime.dispose()
  })
})
