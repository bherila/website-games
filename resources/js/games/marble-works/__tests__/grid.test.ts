import {
  cellCenter,
  computeStars,
  flipPlacement,
  footprintCells,
  placementAt,
  placementProblem,
  remainingCount,
  rotatePlacement,
  worldToCell,
} from '../board/grid'
import type { LevelDef, PiecePlacement } from '../levels/levelTypes'

const LEVEL: LevelDef = {
  id: 99,
  title: 'Test',
  cols: 6,
  rows: 5,
  start: { col: 0, row: 0 },
  goal: { col: 5, row: 4 },
  blocks: [{ col: 2, row: 2, w: 2, h: 1 }],
  pegs: [{ col: 4, row: 0 }],
  fixed: [{ pieceId: 'track-short', col: 1, row: 1, variant: 0, flipped: false }],
  noBuild: [{ col: 0, row: 4 }],
  inventory: { 'ramp-steep': 2, uturn: 1, funnel: 1 },
  par: { two: 3, three: 2 },
  solution: [],
}

const P = (pieceId: PiecePlacement['pieceId'], col: number, row: number, variant = 0, flipped = false): PiecePlacement => ({ pieceId, col, row, variant, flipped })

describe('board grid', () => {
  it('maps cells to world centres and back (+y up)', () => {
    expect(cellCenter(LEVEL, { col: 0, row: 0 })).toEqual([0.5, 4.5])
    expect(cellCenter(LEVEL, { col: 5, row: 4 })).toEqual([5.5, 0.5])
    expect(worldToCell(LEVEL, 0.5, 4.5)).toEqual({ col: 0, row: 0 })
    expect(worldToCell(LEVEL, 5.9, 0.1)).toEqual({ col: 5, row: 4 })
    expect(worldToCell(LEVEL, -0.1, 2)).toBeNull()
    expect(worldToCell(LEVEL, 2, 5.1)).toBeNull()
  })

  it('computes multi-cell footprints from the top-left anchor', () => {
    expect(footprintCells(P('uturn', 3, 0))).toEqual([{ col: 3, row: 0 }, { col: 3, row: 1 }])
    expect(footprintCells(P('funnel', 0, 3))).toEqual([{ col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 }])
  })

  it('rejects placements off the board, on reserved cells, or overlapping', () => {
    expect(placementProblem(LEVEL, [], P('funnel', 4, 3))).toBe('out-of-bounds')
    expect(placementProblem(LEVEL, [], P('uturn', 5, 4))).toBe('out-of-bounds')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 0, 0))).toBe('blocked')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 3, 2))).toBe('blocked')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 4, 0))).toBe('blocked')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 1, 1))).toBe('blocked')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 0, 4))).toBe('blocked')
    expect(placementProblem(LEVEL, [P('uturn', 5, 1)], P('ramp-steep', 5, 2))).toBe('overlap')
    expect(placementProblem(LEVEL, [], P('ramp-steep', 3, 3))).toBeNull()
  })

  it('enforces the level inventory, except when moving an existing piece', () => {
    const placed = [P('ramp-steep', 0, 1), P('ramp-steep', 0, 2)]

    expect(remainingCount(LEVEL, placed, 'ramp-steep')).toBe(0)
    expect(placementProblem(LEVEL, placed, P('ramp-steep', 3, 3))).toBe('no-inventory')
    expect(placementProblem(LEVEL, placed, P('ramp-steep', 3, 3), 0)).toBeNull()
    expect(placementProblem(LEVEL, [], P('kicker', 3, 3))).toBe('no-inventory')
  })

  it('finds the placement covering a cell', () => {
    const placed = [P('ramp-steep', 0, 1), P('uturn', 5, 1)]

    expect(placementAt(placed, { col: 5, row: 2 })).toBe(1)
    expect(placementAt(placed, { col: 3, row: 3 })).toBe(-1)
  })

  it('cycles rotation variants and toggles flip', () => {
    const curve = P('curve', 2, 3)

    expect(rotatePlacement(curve).variant).toBe(1)
    expect(rotatePlacement(rotatePlacement(curve)).variant).toBe(0)
    expect(flipPlacement(curve).flipped).toBe(true)
  })

  it('awards stars by pieces used against par', () => {
    expect(computeStars(2, LEVEL.par)).toBe(3)
    expect(computeStars(3, LEVEL.par)).toBe(2)
    expect(computeStars(9, LEVEL.par)).toBe(1)
  })
})
