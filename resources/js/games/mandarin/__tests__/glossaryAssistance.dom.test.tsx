/**
 * The header's Words button is a route to the English meaning of every word the
 * learner has met, and it lives outside the question's own help controls. These
 * tests exercise the whole header → overlay → question path, because the bug
 * they guard against is invisible when ListeningQuestion is tested alone: help
 * taken through the shell used to leave the answer recorded as unaided.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import type { PracticeEvent } from '../contracts/mandarin'
import { loadCourse } from '../domain/course'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

const course = loadCourse()

function click(element: HTMLElement): void {
  fireEvent.click(element)
}

function startRuntime(): { runtime: ReturnType<typeof createPreviewRuntime>; events: PracticeEvent[] } {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.1', onboardingComplete: true, currentNodeId: 's1n1' })
  const runtime = createPreviewRuntime({
    scenario: findPreviewScenario('fresh'),
    store,
    speechSynthesis: null,
    sfx: NULL_SFX_PLAYER,
    channelDeps: { simulatedDurationMs: () => 1 },
    appendDelayMs: 0,
  })
  const events: PracticeEvent[] = []
  const append = runtime.gateway.appendEvents.bind(runtime.gateway)
  runtime.gateway.appendEvents = (batch, signal) => {
    events.push(...batch)
    return append(batch, signal)
  }
  return { runtime, events }
}

/** Home → first teaching node → its first question. */
async function openFirstQuestion(): Promise<void> {
  const home = await screen.findByTestId('home-screen')
  click(within(home).getByTestId('continue-button'))
  const teaching = await screen.findByTestId('teaching-screen')
  click(within(teaching).getByTestId('start-questions'))
  await screen.findByTestId('listening-question')
}

function answerCorrectly(): void {
  const question = screen.getByTestId('listening-question')
  const exercise = course.exerciseById.get(question.getAttribute('data-exercise-id')!)!
  const correct = within(question).getAllByTestId('answer-option')
    .find((option) => option.getAttribute('data-option-id') === exercise.correctOptionId)!
  click(correct)
  click(within(question).getByTestId('check-answer'))
}

describe('glossary access during an unanswered question', () => {
  it('warns first, then records the answer as assisted when the learner opens Words', async () => {
    const { runtime, events } = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openFirstQuestion()

    const words = screen.getByTestId('glossary-button')
    expect(words).toHaveAttribute('data-glossary-help', 'costs-help')

    // The cost is stated before it is paid: no overlay until the learner agrees.
    click(words)
    expect(screen.queryByTestId('glossary-overlay')).toBeNull()
    const confirm = screen.getByTestId('glossary-help-confirm')
    expect(confirm).toHaveTextContent(/counts as help/i)

    click(within(confirm).getByTestId('glossary-help-confirm-confirm'))
    await screen.findByTestId('glossary-overlay')
    click(screen.getByLabelText('Close'))

    answerCorrectly()
    await screen.findByTestId('feedback')

    // The record, not just the badge. (The chip reads "not scored" in the preview
    // runtime, where no real Mandarin audio ever completes.)
    await waitFor(() => expect(events.some((event) => event.kind === 'help_revealed')).toBe(true))
    const response = events.filter((event) => event.kind === 'response').at(-1)!
    expect(response.textHelpUsed).toBe(true)
    runtime.dispose()
  })

  it('records nothing when the learner backs out of the warning', async () => {
    const { runtime, events } = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openFirstQuestion()

    click(screen.getByTestId('glossary-button'))
    click(within(screen.getByTestId('glossary-help-confirm')).getByTestId('glossary-help-confirm-cancel'))
    expect(screen.queryByTestId('glossary-help-confirm')).toBeNull()
    expect(screen.queryByTestId('glossary-overlay')).toBeNull()

    answerCorrectly()
    await screen.findByTestId('feedback')
    expect(events.some((event) => event.kind === 'help_revealed')).toBe(false)
    expect(events.filter((event) => event.kind === 'response').at(-1)!.textHelpUsed).toBe(false)
    runtime.dispose()
  })

  it('opens without a warning once the question is resolved', async () => {
    const { runtime } = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openFirstQuestion()
    answerCorrectly()
    await screen.findByTestId('feedback')

    // The answer is already disclosed; the glossary can add nothing to it.
    const words = screen.getByTestId('glossary-button')
    expect(words).toHaveAttribute('data-glossary-help', 'free')
    click(words)
    expect(screen.queryByTestId('glossary-help-confirm')).toBeNull()
    await screen.findByTestId('glossary-overlay')
    runtime.dispose()
  })
})
