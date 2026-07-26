import { generateLevel, solverCompletesLevel, starsForState, TOTAL_LEVELS } from '../gameEngine'
import { MARBLE_LEVELS } from '../levels'

describe('marble sort campaign levels', () => {
  it('defines 25 levels with sequential ids', () => {
    expect(TOTAL_LEVELS).toBe(25)
    expect(MARBLE_LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1),
    )
  })

  it.each(MARBLE_LEVELS.map((level) => [level.id] as const))(
    'level %i generates a real solvable board, not the fallback',
    (levelId) => {
      const state = generateLevel(levelId)

      expect(solverCompletesLevel(state)).toBe(true)
      // The fallback level announces itself with a shorter ready message and
      // has no chutes; a curated level must come from the real generator.
      expect(state.lastMessage).toContain('Pop exposed tiles')
    },
  )

  it('is deterministic per level', () => {
    for (const def of MARBLE_LEVELS) {
      const first = generateLevel(def.id)
      const second = generateLevel(def.id)

      expect(first.boxes).toEqual(second.boxes)
      expect(first.chutes).toEqual(second.chutes)
      expect(first.sortingStacks).toEqual(second.sortingStacks)
    }
  })
})

describe('marble sort star rating', () => {
  it('gives 3 stars for no power-ups, 2 for light use, 1 otherwise', () => {
    expect(starsForState({ powerUpsUsed: 0 })).toBe(3)
    expect(starsForState({ powerUpsUsed: 1 })).toBe(2)
    expect(starsForState({ powerUpsUsed: 2 })).toBe(2)
    expect(starsForState({ powerUpsUsed: 3 })).toBe(1)
  })
})
