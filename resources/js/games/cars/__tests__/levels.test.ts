import { generateLevel, starsForState, TOTAL_LEVELS } from '../gameEngine'
import { STARTING_REGULAR_SLOTS } from '../gameTypes'
import { PARKING_LEVELS } from '../levels/levels'
import { validateLevelDef } from '../levels/levelValidation'

describe('parking pickup authored levels', () => {
  it('defines 25 levels with sequential ids', () => {
    expect(TOTAL_LEVELS).toBe(25)
    expect(PARKING_LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1),
    )
  })

  it.each(PARKING_LEVELS.map((level) => [level.id, level] as const))(
    'level %i is structurally valid and solvable on the starting slots',
    (_levelId, def) => {
      const result = validateLevelDef(def)

      expect(result.errors).toEqual([])
    },
  )

  it('is deterministic: the same level generates identically twice', () => {
    for (const def of PARKING_LEVELS) {
      const first = generateLevel(def.id)
      const second = generateLevel(def.id)

      expect(first.cars).toEqual(second.cars)
      expect(first.passengerQueue).toEqual(second.passengerQueue)
    }
  })

  it('ramps car counts upward from tutorial to finale', () => {
    const firstCount = generateLevel(1).cars.length
    const lastCount = generateLevel(TOTAL_LEVELS).cars.length

    expect(firstCount).toBeLessThanOrEqual(4)
    expect(lastCount).toBeGreaterThanOrEqual(18)
  })

  it('shows each level intro as the starting message', () => {
    for (const def of PARKING_LEVELS) {
      if (def.intro) {
        expect(generateLevel(def.id).lastMessage).toBe(def.intro)
      }
    }
  })
})

describe('star rating', () => {
  it('gives 3 stars for a clean run, 2 for light assists, 1 otherwise', () => {
    expect(starsForState({ maxRegularSlotsUnlocked: STARTING_REGULAR_SLOTS, powerUpsUsed: 0 })).toBe(3)
    expect(starsForState({ maxRegularSlotsUnlocked: STARTING_REGULAR_SLOTS + 1, powerUpsUsed: 0 })).toBe(2)
    expect(starsForState({ maxRegularSlotsUnlocked: STARTING_REGULAR_SLOTS, powerUpsUsed: 2 })).toBe(2)
    expect(starsForState({ maxRegularSlotsUnlocked: STARTING_REGULAR_SLOTS + 2, powerUpsUsed: 1 })).toBe(1)
  })
})
