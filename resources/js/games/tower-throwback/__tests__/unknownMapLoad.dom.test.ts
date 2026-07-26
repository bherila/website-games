/**
 * The unknown-map load path needs real storage, so it lives in the jsdom
 * project rather than alongside the pure registry tests.
 */
import { loadSandbox, loadSandboxSlotSummaries, sandboxLoadFailure } from '../gameProgress'
import { SANDBOX_STORAGE_KEY } from '../gameTypes'

describe('loading a save from an unknown map', () => {
  const KEY = SANDBOX_STORAGE_KEY

  beforeEach(() => localStorage.clear())

  it('is reported as needing a newer version, not as unreadable', () => {
    // The tower is intact; only this build is too old to open it. Reporting
    // "empty or unreadable" would tell the player their save is gone.
    localStorage.setItem(KEY, JSON.stringify({ version: 2, mapId: 'falls', seed: 1 }))

    expect(sandboxLoadFailure('autosave')).toBe('unknownMap')
    expect(loadSandbox('autosave')).toBeNull()
    expect(loadSandboxSlotSummaries()[0]).toMatchObject({
      id: 'autosave',
      saved: false,
      loadFailure: 'unknownMap',
    })
  })

  it('does not claim an unknown map for ordinary corruption', () => {
    localStorage.setItem(KEY, '{ not json')
    expect(sandboxLoadFailure('autosave')).toBeNull()

    localStorage.setItem(KEY, JSON.stringify({ version: 2, mapId: 'city-tower', seed: 1 }))
    expect(sandboxLoadFailure('autosave')).toBeNull()
  })

  it('reports nothing for an empty slot', () => {
    expect(sandboxLoadFailure('autosave')).toBeNull()
  })
})
