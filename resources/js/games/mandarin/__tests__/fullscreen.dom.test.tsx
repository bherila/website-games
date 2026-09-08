/**
 * Full screen in Mandarin Quest is three different things depending on the
 * device, and the wrong one shown to the wrong player is worse than nothing:
 * an iPhone player tapping a toggle that cannot work, or an installed-app
 * player being told to install.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

const originalMatchMedia = window.matchMedia
const originalUserAgent = navigator.userAgent

function setFullscreenEnabled(value: boolean | undefined): void {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value })
}

function setStandalone(value: boolean): void {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: value && query === '(display-mode: standalone)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
}

function setUserAgent(value: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value })
}

function startRuntime(): ReturnType<typeof createPreviewRuntime> {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.1.0', onboardingComplete: true, currentNodeId: 's1n1' })
  return createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })
}

async function openSettings(): Promise<HTMLElement> {
  await screen.findByTestId('home-screen')
  fireEvent.click(screen.getByLabelText('Settings'))
  return screen.findByTestId('settings-screen')
}

afterEach(() => {
  setFullscreenEnabled(undefined)
  window.matchMedia = originalMatchMedia
  setUserAgent(originalUserAgent)
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen
})

describe('Mandarin full screen', () => {
  it('offers the toggle in the header where the browser supports it', async () => {
    setFullscreenEnabled(true)
    setStandalone(false)
    const requestFullscreen = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })

    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')

    fireEvent.click(screen.getByTestId('fullscreen-toggle'))
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
    runtime.dispose()
  })

  it('shows no toggle on iPhone Safari, and explains the only route that works there', async () => {
    // No `fullscreenEnabled`: iPhone Safari implements no Element Fullscreen
    // API, so a toggle there would be a button that cannot do anything.
    setFullscreenEnabled(undefined)
    setStandalone(false)
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')

    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    const settings = await openSettings()

    expect(screen.queryByTestId('fullscreen-toggle')).toBeNull()
    const note = within(settings).getByTestId('fullscreen-note')
    expect(note).toHaveAttribute('data-fullscreen-mode', 'install-ios')
    expect(note).toHaveTextContent(/Add to Home Screen/i)
    expect(within(note).queryByTestId('fullscreen-note-toggle')).toBeNull()
    runtime.dispose()
  })

  it('still offers the install route when the user agent is unrecognised', async () => {
    // The advice is chosen on capability, not on the UA string: a browser with
    // no fullscreen API that we cannot identify can still be installed, so it
    // must not land on a dead end.
    setFullscreenEnabled(undefined)
    setStandalone(false)
    setUserAgent('Some/1.0 (Unknown device)')

    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    const settings = await openSettings()

    const note = within(settings).getByTestId('fullscreen-note')
    expect(note).toHaveAttribute('data-fullscreen-mode', 'install')
    expect(note).toHaveTextContent(/home screen/i)
    runtime.dispose()
  })

  it('tells an installed-app player there is nothing to do', async () => {
    setFullscreenEnabled(true)
    setStandalone(true)

    const runtime = startRuntime()
    render(<MandarinGame runtime={runtime} />)
    const settings = await openSettings()

    // Already chrome-less: no toggle, and no instruction to install what is
    // plainly installed.
    expect(screen.queryByTestId('fullscreen-toggle')).toBeNull()
    const note = within(settings).getByTestId('fullscreen-note')
    expect(note).toHaveAttribute('data-fullscreen-mode', 'standalone')
    expect(note.textContent).not.toMatch(/Add to Home Screen/i)
    runtime.dispose()
  })
})
