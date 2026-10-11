/**
 * A tab left open across a deploy replays the server's log with the old
 * scheduler policy until it reloads (#109 review, #101 step 0). The page must
 * say so rather than quietly schedule differently from the account.
 */
import { render, screen, waitFor } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { SCHEDULER_VERSION } from '../domain/scheduler'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

function start(schedulerVersion: string | null) {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  const runtime = createPreviewRuntime({ scenario: findPreviewScenario('returning'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })
  if (schedulerVersion !== null) {
    const original = runtime.gateway.getProgress.bind(runtime.gateway)
    jest.spyOn(runtime.gateway, 'getProgress').mockImplementation(async () => ({
      ...(await original()),
      schedulerVersion,
      listeningCards: { kind: 'graded-review-log', windowMinutes: 10, reviews: [] },
    }))
  }
  render(<MandarinGame runtime={runtime} />)

  return runtime
}

describe('scheduler version check', () => {
  it('asks for a reload when the server names a different scheduler policy', async () => {
    const runtime = start('ts-fsrs-5.4.2')
    await screen.findByTestId('home-screen')
    expect(await screen.findByTestId('update-banner')).toHaveTextContent(/reload/i)
    runtime.dispose()
  })

  it('stays quiet when the versions match', async () => {
    const runtime = start(SCHEDULER_VERSION)
    await screen.findByTestId('home-screen')
    await waitFor(() => expect(runtime.gateway.getProgress).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('update-banner')).toBeNull()
    runtime.dispose()
  })

  it('stays quiet in the preview, which names no real scheduler', async () => {
    const runtime = start(null)
    await screen.findByTestId('home-screen')
    expect(screen.queryByTestId('update-banner')).toBeNull()
    runtime.dispose()
  })
})
