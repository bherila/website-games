import { LEVELS } from '../levels/levels'
import { orientations, searchLevel } from '../levels/levelSearch'

function level(title: string) {
  const found = LEVELS.find((candidate) => candidate.title === title)
  if (!found) {
    throw new Error(`missing ${title}`)
  }

  return found
}

describe('level search (shortcut finder)', () => {
  it('lists every orientation a piece can take', () => {
    expect(orientations('track-short')).toEqual([{ variant: 0, flipped: false }])
    expect(orientations('ramp-steep')).toEqual([{ variant: 0, flipped: false }, { variant: 0, flipped: true }])
    expect(orientations('curve')).toHaveLength(4)
  })

  it('proves the tutorial needs exactly one piece', () => {
    const result = searchLevel(level('First Drop'), { maxPieces: 1 })

    expect(result).toMatchObject({ minPieces: 1, exhausted: true, depthExplored: 1 })
    expect(result.solutions).toContainEqual([{ pieceId: 'ramp-steep', col: 1, row: 3, variant: 0, flipped: false }])
  })

  it('proves Zig-Zag needs its par of three ramps to collect the gem', () => {
    const zigZag = level('Zig-Zag')
    const result = searchLevel(zigZag, { maxPieces: zigZag.par, requireGems: true, stopAtFirstDepth: true })

    expect(result.exhausted).toBe(true)
    expect(result.minPieces).toBe(zigZag.par)
  })

  it('reports when the run budget stops it before the space is exhausted', () => {
    const result = searchLevel(level('Grand Machine'), { maxPieces: 3, maxRuns: 20 })

    expect(result.runs).toBe(20)
    expect(result.exhausted).toBe(false)
  })
})
