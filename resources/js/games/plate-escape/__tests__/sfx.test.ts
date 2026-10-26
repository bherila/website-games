import { recordRecipe } from '../../_shared/audio/__tests__/recipeHarness'
import { COLORS, type ScrewColor } from '../level'
import { PLATE_SOUNDS } from '../sfx'

test.each(Object.entries(PLATE_SOUNDS))('%s is a short toy-sized sound', (_name, recipe) => {
  // Toy-sized: nothing over 0.8 s. The shared recipe test covers pitch and level bounds.
  for (const call of recordRecipe(recipe)) expect(call.end).toBeLessThanOrEqual(0.8)
})

test('each drive unscrews with its own sound', () => {
  // Rhythm, pitch and timbre together: no two colors may record the same voice calls.
  const colors = Object.keys(COLORS) as ScrewColor[]
  const recorded = colors.map((color) => JSON.stringify(recordRecipe(PLATE_SOUNDS[`unscrew-${color}`])))
  expect(new Set(recorded).size).toBe(colors.length)
  // Every one still ends in the rising pop of a screw coming free.
  for (const color of colors) {
    const pop = recordRecipe(PLATE_SOUNDS[`unscrew-${color}`]).at(-1)!
    expect(pop.kind).toBe('tone')
    expect(pop.to).toBeGreaterThan(pop.from * 2)
  }
})
