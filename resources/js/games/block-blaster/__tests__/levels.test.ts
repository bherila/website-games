import { TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels/levels'
import { validateLevelBlocks } from '../levels/levelValidation'

describe('LEVELS acceptance criteria (B)', () => {
  it('has exactly 25 levels with contiguous ids 1..25', () => {
    expect(LEVELS).toHaveLength(25)
    LEVELS.forEach((level, index) => {
      expect(level.id).toBe(index + 1)
    })
  })

  it('matches the TOTAL_LEVELS contract constant (unlock cap depends on it)', () => {
    expect(LEVELS).toHaveLength(TOTAL_LEVELS)
  })

  it.each(LEVELS.map((level) => [level.id, level]))('level %d has a sane balls/star budget', (_id, level) => {
    const { twoStar, threeStar } = level.starThresholds
    expect(twoStar).toBeGreaterThanOrEqual(0)
    expect(threeStar).toBeGreaterThan(twoStar)
    expect(level.balls).toBeGreaterThan(threeStar)
  })

  it.each(LEVELS.map((level) => [level.id, level]))('level %d has <= 26 total blocks', (_id, level) => {
    const blockCount = level.platforms.reduce((sum, platform) => sum + platform.blocks.length, 0)
    expect(blockCount).toBeLessThanOrEqual(26)
  })

  it.each(LEVELS.map((level) => [level.id, level]))('level %d passes footprint/interpenetration/support validation', (_id, level) => {
    const issues = validateLevelBlocks(level)
    expect(issues).toEqual([])
  })

  it('levels 1-6 use only static platforms', () => {
    for (const level of LEVELS.slice(0, 6)) {
      for (const platform of level.platforms) {
        expect(platform.rotation).toBeUndefined()
      }
    }
  })

  it('the first rotating platform appears at level 7, not earlier', () => {
    const firstRotatingLevel = LEVELS.find((level) => level.platforms.some((platform) => platform.rotation !== undefined))
    expect(firstRotatingLevel?.id).toBe(7)
  })

  it('every two-platform level has at least 6 balls', () => {
    for (const level of LEVELS) {
      if (level.platforms.length >= 2) {
        expect(level.balls).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it.each([1, 2, 3, 4])('tutorial level %d defines a hint', (id) => {
    const level = LEVELS.find((candidate) => candidate.id === id)
    expect(level?.hint).toBeDefined()
  })

  it.each(LEVELS.filter((level) => level.hint).map((level) => [level.id, level]))(
    'level %d hint points at a valid block index',
    (_id, level) => {
      const hint = level.hint
      expect(hint).toBeDefined()
      if (!hint) {
        return
      }
      const platform = level.platforms[hint.platform]
      expect(platform).toBeDefined()
      const block = platform?.blocks[hint.block]
      expect(block).toBeDefined()
    },
  )
})
