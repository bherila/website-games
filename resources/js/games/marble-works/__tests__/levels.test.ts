import { TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels/levels'
import { validateLevel } from '../levels/levelValidation'
import { PIECES } from '../pieces/pieceCatalog'

describe('Marble Works level catalogue', () => {
  it('ships 12 levels with sequential ids', () => {
    expect(TOTAL_LEVELS).toBe(12)
    expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
  })

  it.each(LEVELS.map((level) => [level.id, level] as const))('level %i passes static validation', (_id, level) => {
    expect(validateLevel(level)).toEqual([])
  })

  it('has a guided tutorial on level 1 only', () => {
    expect(LEVELS[0]?.tutorial).toBeDefined()
    expect(LEVELS.slice(1).every((level) => level.tutorial === undefined)).toBe(true)
  })

  it('introduces every piece family somewhere in the campaign', () => {
    const families = new Set(LEVELS.flatMap((level) => Object.keys(level.inventory).map((id) => PIECES[id as keyof typeof PIECES].family)))

    expect([...families].sort()).toEqual(['bouncer', 'jump', 'ramp', 'track', 'tube', 'turn'])
  })

  it('reports overlapping and unreachable definitions', () => {
    const base = LEVELS[0]
    if (!base) {
      throw new Error('missing level 1')
    }

    expect(validateLevel({ ...base, goal: base.start })).toEqual(expect.arrayContaining([expect.stringContaining('overlaps')]))
    expect(validateLevel({ ...base, par: { two: 1, three: 0 } })).toEqual(expect.arrayContaining([expect.stringContaining('3-star par')]))
    expect(validateLevel({ ...base, solution: [{ pieceId: 'ramp-steep', col: 1, row: 0, variant: 0, flipped: false }] }))
      .toEqual(expect.arrayContaining([expect.stringContaining('illegal')]))
  })
})
