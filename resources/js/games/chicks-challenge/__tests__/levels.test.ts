import { TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels'
import { parseLevel } from '../levels/parseLevel'
import { validateLevelDef } from '../levels/validation'

describe('pack completeness', () => {
  test(`exactly ${TOTAL_LEVELS} levels with contiguous ids`, () => {
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1),
    )
  })

  test('titles are unique and non-empty', () => {
    const titles = LEVELS.map((level) => level.title.trim())
    expect(titles.every((title) => title.length > 0)).toBe(true)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('static validation', () => {
  for (const def of LEVELS) {
    test(`level ${def.id} '${def.title}' passes static checks and parses`, () => {
      expect(validateLevelDef(def)).toEqual([])
      expect(() => parseLevel(def)).not.toThrow()
    })
  }
})
