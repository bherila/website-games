import { SFX_RECIPES as twenty48 } from '../../../2048/audio/sfx'
import { SFX_RECIPES as chicks } from '../../../chicks-challenge/audio/sfx'
import { SFX_RECIPES as hover } from '../../../hover/audio/sfx'
import { SFX_RECIPES as mathHorde } from '../../../math-horde/audio/sfx'
import { PLATE_SOUNDS } from '../../../plate-escape/sfx'
import type { SynthRecipe } from '../synthSfx'
import { recordRecipe } from './recipeHarness'

const games: Record<string, Record<string, SynthRecipe>> = { '2048': twenty48, chicks, hover, 'math-horde': mathHorde, 'plate-escape': PLATE_SOUNDS }
const cases = Object.entries(games).flatMap(([game, recipes]) => Object.entries(recipes).map(([name, recipe]) => [game, name, recipe] as const))

test.each(cases)('%s %s makes an audible, bounded sound at any intensity', (_game, _name, recipe) => {
  for (const intensity of [undefined, 0, 0.5, 1, 5]) {
    const calls = recordRecipe(recipe, intensity)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      for (const value of [call.from, call.to, call.duration, call.gain, call.end]) expect(Number.isFinite(value)).toBe(true)
      expect(Math.min(call.from, call.to)).toBeGreaterThanOrEqual(20)
      expect(Math.max(call.from, call.to)).toBeLessThanOrEqual(8000)
      expect(call.gain).toBeGreaterThan(0)
      expect(call.gain).toBeLessThanOrEqual(0.25)
      expect(call.end).toBeLessThanOrEqual(1.2)
    }
  }
})
