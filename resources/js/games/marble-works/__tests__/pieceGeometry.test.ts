import { placementSize, placementWalls } from '../board/grid'
import { PIECE_IDS, PIECES, pieceVariant, SURFACE } from '../pieces/pieceCatalog'

const BOARD = { cols: 8, rows: 8 }

describe('piece geometry', () => {
  it.each(PIECE_IDS)('%s keeps every wall inside its footprint (surface overhang allowed)', (pieceId) => {
    PIECES[pieceId].variants.forEach((variant) => {
      for (const wall of variant.walls) {
        for (const [x, y] of wall.points) {
          expect(x).toBeGreaterThanOrEqual(-1e-6)
          expect(x).toBeLessThanOrEqual(variant.w + 1e-6)
          expect(y).toBeGreaterThanOrEqual(-1e-6)
          // Ramps start at the row above's rolling surface, SURFACE above their own top edge.
          expect(y).toBeLessThanOrEqual(variant.h + SURFACE + 1e-6)
        }
      }
    })
  })

  it('places a steep ramp from the row above’s surface down to its own', () => {
    const [wall] = placementWalls(BOARD, { pieceId: 'ramp-steep', col: 2, row: 3, variant: 0, flipped: false })

    // Row 3 spans y ∈ [4, 5]; the ramp enters at 5 + SURFACE on the left and leaves at 4 + SURFACE.
    expect(wall?.points).toEqual([[2, 5 + SURFACE], [3, 4 + SURFACE]])
  })

  it('mirrors a flipped piece and reverses its points so the solid stays underneath', () => {
    const [wall] = placementWalls(BOARD, { pieceId: 'ramp-steep', col: 2, row: 3, variant: 0, flipped: true })

    expect(wall?.points).toEqual([[2, 4 + SURFACE], [3, 5 + SURFACE]])
  })

  it('chains ramps diagonally: one ramp’s exit is the next ramp’s entry', () => {
    const [upper] = placementWalls(BOARD, { pieceId: 'ramp-steep', col: 1, row: 1, variant: 0, flipped: false })
    const [lower] = placementWalls(BOARD, { pieceId: 'ramp-steep', col: 2, row: 2, variant: 0, flipped: false })

    expect(upper?.points.at(-1)).toEqual(lower?.points[0])
  })

  it('keeps every variant of a piece on the same footprint', () => {
    for (const pieceId of PIECE_IDS) {
      const sizes = PIECES[pieceId].variants.map((_, index) => placementSize({ pieceId, variant: index }))

      expect(new Set(sizes.map((size) => `${size.w}x${size.h}`)).size).toBe(1)
    }
  })

  it('wraps variant indices', () => {
    expect(pieceVariant('curve', 2)).toBe(PIECES.curve.variants[0])
    expect(pieceVariant('curve', -1)).toBe(PIECES.curve.variants[1])
  })
})
