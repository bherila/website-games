import { createSynthSfx } from '../synthSfx'

// Runs in the node project: no window, so every call path must be a safe no-op.
test('plays, mutes and disposes without a browser audio stack', () => {
  const recipe = jest.fn()
  const sfx = createSynthSfx({ ping: recipe })
  expect(() => { sfx.unlock(); sfx.play('ping'); sfx.setMuted(true); sfx.play('ping'); sfx.dispose() }).not.toThrow()
  expect(recipe).not.toHaveBeenCalled()
})
