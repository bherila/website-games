/**
 * The teaching dialogue stage follows the audio, not an animation beat, and it
 * exists only while teaching. The regressions worth guarding are the quiet
 * ones: a line left on screen after playback stopped, and a line surviving into
 * a question where it could answer it.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

function click(element: HTMLElement): void {
  fireEvent.click(element)
}

function startRuntime(): ReturnType<typeof createPreviewRuntime> {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.1', onboardingComplete: true, currentNodeId: 's1n1' })
  return createPreviewRuntime({
    scenario: findPreviewScenario('fresh'),
    store,
    speechSynthesis: null,
    sfx: NULL_SFX_PLAYER,
    channelDeps: { simulatedDurationMs: () => 30 },
    appendDelayMs: 0,
  })
}

async function openTeaching(): Promise<void> {
  click(within(await screen.findByTestId('home-screen')).getByTestId('continue-button'))
  await screen.findByTestId('teaching-screen')
}

/** The Play control on the first dialogue line. */
async function dialoguePlay(): Promise<HTMLElement> {
  const line = (await screen.findAllByTestId('dialogue-line'))[0]!
  const play = within(line).getByTestId('play-button')
  await waitFor(() => expect(play).toBeEnabled())
  return play
}

describe('teaching dialogue stage', () => {
  it('shows nothing until a line plays, then the line that is actually playing', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openTeaching()
    expect(screen.queryByTestId('dialogue-stage')).toBeNull()

    const play = await dialoguePlay()
    const line = play.closest('[data-testid="dialogue-line"]')!
    await act(async () => { click(play) })
    const stage = await screen.findByTestId('dialogue-stage')
    expect(stage.getAttribute('data-utterance-id')).toBe(line.getAttribute('data-utterance-id'))
    runtime.dispose()
  })

  it('clears when playback finishes', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openTeaching()
    const play = await dialoguePlay()
    await act(async () => { click(play) })
    await screen.findByTestId('dialogue-stage')
    await waitFor(() => expect(screen.queryByTestId('dialogue-stage')).toBeNull())
    runtime.dispose()
  })

  it('is duplicate-free for screen readers: the dialogue list carries the text', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openTeaching()
    await act(async () => { click(await dialoguePlay()) })
    expect(await screen.findByTestId('dialogue-stage')).toHaveAttribute('aria-hidden', 'true')
    runtime.dispose()
  })

  it('never survives into a question, even with the scene expanded', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await openTeaching()
    await act(async () => { click(await dialoguePlay()) })
    await screen.findByTestId('dialogue-stage')

    click(within(screen.getByTestId('teaching-screen')).getByTestId('start-questions'))
    await screen.findByTestId('listening-question')
    expect(screen.queryByTestId('dialogue-stage')).toBeNull()

    // Calling the scenery back must not bring the last spoken line with it.
    click(screen.getByTestId('scenery-toggle'))
    expect(screen.queryByTestId('dialogue-stage')).toBeNull()
    runtime.dispose()
  })
})
