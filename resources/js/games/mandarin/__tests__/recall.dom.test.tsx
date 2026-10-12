import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'
import { recallCourse } from './recallFixture'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

async function openRecall(outcome: 'completed' | 'failed' | 'simulated' = 'completed') {
  const course = recallCourse()
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  store.saveProgress({ version: 1, ...course.identity, onboardingComplete: true, currentNodeId: 's1n2', completedNodeIds: ['s1n2'], completedSceneIds: ['s1'] })
  const runtime = createPreviewRuntime({ course, scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })
  const play = jest.spyOn(runtime.audio, 'play').mockResolvedValue(outcome)
  const append = jest.spyOn(runtime.gateway, 'appendEvents')
  render(<MandarinGame runtime={runtime} />)
  fireEvent.click(await screen.findByTestId('review-button'))
  await screen.findByTestId('recall-question')
  return { runtime, play, append, store }
}

describe('say it, then check', () => {
  it('keeps text and audio hidden until commitment, then records a single self-rating', async () => {
    const { runtime, play, append } = await openRecall()
    const question = screen.getByTestId('recall-question')
    expect(question).toHaveTextContent('He is my friend.')
    expect(question).not.toHaveTextContent('他是我的朋友')
    expect(play).not.toHaveBeenCalled()
    fireEvent.click(within(question).getByRole('button', { name: 'Show answer' }))
    expect(await screen.findByTestId('recall-answer')).toHaveTextContent('他是我的朋友')
    const rate = screen.getByRole('button', { name: 'Said it' })
    await waitFor(() => expect(rate).toBeEnabled())
    fireEvent.click(rate)
    expect(await screen.findByText(/Attempt recorded/)).toBeVisible()
    await waitFor(() => expect(append.mock.calls.flatMap(([events]) => events).some((event) => event.responseAction === 'self_check')).toBe(true))
    const events = append.mock.calls.flatMap(([events]) => events).filter((event) => event.kind === 'response')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ schemaVersion: 2, selfRating: 'said_it', attemptIndex: 0, sessionKind: 'scheduled', audioEvidence: { status: 'completed', normalPlayCount: 1 } })
    runtime.dispose()
  })

  it('records simulated audio as unscored practice and keeps the learner able to continue', async () => {
    const { runtime, append } = await openRecall('simulated')
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    const button = await screen.findByRole('button', { name: 'Keep practising' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    expect(await screen.findByText(/without a score/)).toBeVisible()
    await waitFor(() => expect(append.mock.calls.flatMap(([events]) => events).some((event) => event.responseAction === 'dont_know')).toBe(true))
    expect(append.mock.calls.flatMap(([events]) => events).find((event) => event.kind === 'response')).toMatchObject({ selfRating: null, audioEvidence: { status: 'simulated', normalPlayCount: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByTestId('review-complete')).toBeVisible()
    runtime.dispose()
  })
})
