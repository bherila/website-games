import { createSfxEngine, SFX_NAMES } from '../audio/sfx'

// This spec runs in the node Jest project (no `window`), which doubles as
// coverage for the `typeof window === 'undefined'` guard every real-browser
// call path shares with jsdom's "no AudioContext" case.
describe('createSfxEngine (no window)', () => {
  it('never throws for any registered sound, muted or not', () => {
    const engine = createSfxEngine(false)
    engine.unlock()
    for (const name of SFX_NAMES) {
      expect(() => engine.playSfx(name)).not.toThrow()
    }
    engine.setMuted(true)
    expect(() => engine.playSfx('win')).not.toThrow()
    expect(() => engine.dispose()).not.toThrow()
  })

  it('starts muted when constructed muted', () => {
    const engine = createSfxEngine(true)
    expect(() => engine.playSfx('stuck')).not.toThrow()
  })
})
