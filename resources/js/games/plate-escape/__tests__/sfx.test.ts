import { recordRecipe } from '../../_shared/audio/__tests__/recipeHarness'
import { PLATE_SOUNDS } from '../sfx'

test.each(Object.entries(PLATE_SOUNDS))('%s is a short toy-sized sound', (_name, recipe) => {
  // Toy-sized: nothing over 0.8 s. The shared recipe test covers pitch and level bounds.
  for (const call of recordRecipe(recipe)) expect(call.end).toBeLessThanOrEqual(0.8)
})
