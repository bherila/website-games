import { FACINGS, roomFootprint } from '../../engine/building'
import { USE_KINDS, USES } from '../../engine/uses'
import { furniture, placePiece } from '../furniture'

describe('furniture', () => {
  test.each(USE_KINDS)('every %s piece stays inside the room, off the floor and clear of the doorway, at every facing', (use) => {
    const { width, depth } = USES[use]
    const pieces = furniture(use, USES[use].color)
    expect(pieces.length).toBeGreaterThan(3)
    for (const item of pieces) {
      expect(item.u0).toBeGreaterThanOrEqual(0)
      expect(item.u1).toBeLessThanOrEqual(width)
      expect(item.v0).toBeGreaterThanOrEqual(0)
      expect(item.v1).toBeLessThanOrEqual(depth)
      expect(item.h1).toBeGreaterThan(item.h0)
      // The tile behind the door (the middle of the door wall, first row) stays clear.
      const middle = width / 2
      const blocksDoor = item.v0 < 0.3 && item.u0 < middle + 0.5 && item.u1 > middle - 0.5
      expect(blocksDoor).toBe(false)
    }
    for (const facing of FACINGS) {
      const footprint = roomFootprint(use, facing)
      const room = { x: 10, y: 20, ...footprint, facing }
      for (const item of pieces) {
        const at = placePiece(room, item)
        expect(at.x0).toBeGreaterThanOrEqual(10)
        expect(at.x1).toBeLessThanOrEqual(10 + footprint.width)
        expect(at.y0).toBeGreaterThanOrEqual(20)
        expect(at.y1).toBeLessThanOrEqual(20 + footprint.depth)
      }
    }
  })

  test('turns with the room: the door wall side of the layout follows the facing', () => {
    // The café counter sits at the back (v ≈ 3.3–3.75), so it lands opposite the door wall.
    const counter = furniture('cafe', 0)[0]!
    const at = (facing: (typeof FACINGS)[number]) => placePiece({ x: 0, y: 0, width: 4, depth: 4, facing }, counter)
    expect(at('south').y1).toBeLessThan(1)
    expect(at('north').y0).toBeGreaterThan(3)
    expect(at('east').x1).toBeLessThan(1)
    expect(at('west').x0).toBeGreaterThan(3)
  })
})
