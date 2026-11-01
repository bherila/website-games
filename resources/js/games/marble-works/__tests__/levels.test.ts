import { TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels/levels'
import { validateLevel } from '../levels/levelValidation'
import { MARBLE_KIND_ORDER } from '../physics/marbles'
import { PIECES } from '../pieces/pieceCatalog'

describe('Marble Works level catalogue', () => {
  it('ships 19 levels with sequential ids', () => {
    expect(TOTAL_LEVELS).toBe(19)
    expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: 19 }, (_, index) => index + 1))
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

    expect([...families].sort()).toEqual(['bouncer', 'glass', 'jump', 'ramp', 'sorter', 'track', 'tube', 'turn'])
  })

  it('uses every marble kind, and every level after the workshop has gems', () => {
    const kinds = new Set(LEVELS.flatMap((level) => level.droppers.flatMap((dropper) => dropper.marbles)))

    expect([...kinds].sort()).toEqual([...MARBLE_KIND_ORDER].sort())
    expect(LEVELS.slice(1).every((level) => level.gems.length > 0)).toBe(true)
  })

  it('reports overlapping and unreachable definitions', () => {
    const base = LEVELS[0]
    if (!base) {
      throw new Error('missing level 1')
    }

    expect(validateLevel({ ...base, baskets: [{ cell: base.droppers[0]!.cell }] })).toEqual(expect.arrayContaining([expect.stringContaining('overlaps')]))
    expect(validateLevel({ ...base, par: 0 })).toEqual(expect.arrayContaining([expect.stringContaining('par (0)')]))
    expect(validateLevel({ ...base, baskets: [{ cell: base.baskets[0]!.cell, accepts: 'steel' }] })).toEqual(expect.arrayContaining([expect.stringContaining('no basket accepts the glass')]))
    expect(validateLevel({ ...base, gems: [base.droppers[0]!.cell] })).toEqual(expect.arrayContaining([expect.stringContaining('gem 0 sits on')]))
    expect(validateLevel({ ...base, solution: [{ pieceId: 'ramp-steep', col: 1, row: 0, variant: 0, flipped: false }] }))
      .toEqual(expect.arrayContaining([expect.stringContaining('illegal')]))
  })
})
