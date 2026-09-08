/**
 * Scenery must yield to the question on phones. The diorama is decorative, and
 * at min(38dvh,300px) on every route it pushed the later answer options and the
 * Check button below the fold on a 390×844 viewport.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

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
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.1.1', onboardingComplete: true, currentNodeId: 's1n1' })
  return createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })
}

/** The scenery frame carries the phone height only while it takes real space. */
function dioramaTakesPhoneHeight(): boolean {
  return screen.getByTestId('diorama').parentElement!.className.includes('h-[min(38dvh,300px)]')
}

describe('scenery height by route', () => {
  it('keeps the scenery on narrative screens and collapses it for questions', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)

    // Home and teaching are narrative beats: the scenery earns its space.
    const home = await screen.findByTestId('home-screen')
    expect(dioramaTakesPhoneHeight()).toBe(true)
    expect(screen.queryByTestId('scenery-toggle')).toBeNull()

    click(within(home).getByTestId('continue-button'))
    const teaching = await screen.findByTestId('teaching-screen')
    expect(dioramaTakesPhoneHeight()).toBe(true)
    expect(screen.queryByTestId('scenery-toggle')).toBeNull()

    // Questions are where the space is needed.
    click(within(teaching).getByTestId('start-questions'))
    await screen.findByTestId('listening-question')
    expect(dioramaTakesPhoneHeight()).toBe(false)
    expect(screen.getByTestId('scenery-toggle')).toHaveTextContent('Show scene')
    runtime.dispose()
  })

  it('lets the learner call the scenery back, and collapses it again on the next screen', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    click(within(await screen.findByTestId('home-screen')).getByTestId('continue-button'))
    click(within(await screen.findByTestId('teaching-screen')).getByTestId('start-questions'))
    await screen.findByTestId('listening-question')

    click(screen.getByTestId('scenery-toggle'))
    expect(dioramaTakesPhoneHeight()).toBe(true)
    expect(screen.getByTestId('scenery-toggle')).toHaveTextContent('Hide scene')

    // Expanding is a look, not a stored preference that reinstates the defect.
    // The node is introduced now, so Continue re-enters its questions directly.
    click(screen.getByLabelText('Home'))
    click(within(await screen.findByTestId('home-screen')).getByTestId('continue-button'))
    await screen.findByTestId('lesson-screen')
    expect(dioramaTakesPhoneHeight()).toBe(false)
    runtime.dispose()
  })

  it('collapses again on the next question, not only on the next screen', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    click(within(await screen.findByTestId('home-screen')).getByTestId('continue-button'))
    click(within(await screen.findByTestId('teaching-screen')).getByTestId('start-questions'))
    await screen.findByTestId('listening-question')

    click(screen.getByTestId('scenery-toggle'))
    expect(dioramaTakesPhoneHeight()).toBe(true)

    // These screens advance from one item to the next without changing route,
    // so keying the open flag on the route alone left the 38dvh panel crowding
    // every later question in the session.
    click(screen.getByTestId('dont-know'))
    click(await screen.findByTestId('continue'))
    await screen.findByTestId('listening-question')
    expect(dioramaTakesPhoneHeight()).toBe(false)
    expect(screen.getByTestId('scenery-toggle')).toHaveTextContent('Show scene')
    runtime.dispose()
  })

  it('shows nothing in the strip that could answer the open question', async () => {
    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    click(within(await screen.findByTestId('home-screen')).getByTestId('continue-button'))
    click(within(await screen.findByTestId('teaching-screen')).getByTestId('start-questions'))
    await screen.findByTestId('listening-question')

    // Scene number and position only: no objective, node title or summary.
    const strip = screen.getByTestId('scenery-toggle').parentElement!
    expect(strip).toHaveTextContent('Scene 1 of 10')
    expect(strip.textContent).not.toMatch(/gate|introduce|friend|waiting/i)
    runtime.dispose()
  })
})
