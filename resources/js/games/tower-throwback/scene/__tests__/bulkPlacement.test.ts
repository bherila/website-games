import { bulkPlacementCells } from '../bulkPlacement'

describe('bulkPlacementCells', () => {
  it('tiles horizontally by item width', () => {
    expect(bulkPlacementCells(6, 1, { floor: 3, x: 0 }, { floor: 3, x: 17 })).toEqual([
      { floor: 3, x: 0 },
      { floor: 3, x: 6 },
      { floor: 3, x: 12 },
    ])
  })

  it('steps floors by storeys for two-storey units', () => {
    expect(bulkPlacementCells(20, 2, { floor: 0, x: 0 }, { floor: 5, x: 39 })).toEqual([
      { floor: 0, x: 0 },
      { floor: 0, x: 20 },
      { floor: 2, x: 0 },
      { floor: 2, x: 20 },
      { floor: 4, x: 0 },
      { floor: 4, x: 20 },
    ])
  })

  it('normalizes reversed drags across both axes', () => {
    expect(bulkPlacementCells(4, 1, { floor: 4, x: 12 }, { floor: 2, x: 1 })).toEqual([
      { floor: 2, x: 1 },
      { floor: 2, x: 5 },
      { floor: 2, x: 9 },
      { floor: 3, x: 1 },
      { floor: 3, x: 5 },
      { floor: 3, x: 9 },
      { floor: 4, x: 1 },
      { floor: 4, x: 5 },
      { floor: 4, x: 9 },
    ])
  })

  it('returns one anchor cell for a degenerate drag', () => {
    expect(bulkPlacementCells(6, 1, { floor: 7, x: 9 }, { floor: 7, x: 9 })).toEqual([{ floor: 7, x: 9 }])
  })

  it('returns one full-row cell per floor when the caller passes a per-tile row width', () => {
    expect(bulkPlacementCells(12, 1, { floor: 1, x: 4 }, { floor: 3, x: 15 })).toEqual([
      { floor: 1, x: 4 },
      { floor: 2, x: 4 },
      { floor: 3, x: 4 },
    ])
  })

  it('caps large drags at 400 cells', () => {
    const cells = bulkPlacementCells(1, 1, { floor: 0, x: 0 }, { floor: 99, x: 99 })

    expect(cells).toHaveLength(400)
    expect(cells[0]).toEqual({ floor: 0, x: 0 })
    expect(cells.at(-1)).toEqual({ floor: 3, x: 99 })
  })
})
