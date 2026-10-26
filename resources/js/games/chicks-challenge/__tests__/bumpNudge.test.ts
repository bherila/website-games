import { bumpNudgeOffset } from '../scene/bumpNudge'
import { BUMP_NUDGE_MS, BUMP_NUDGE_TILES } from '../scene/sceneConstants'

describe('bumpNudgeOffset', () => {
  it('leans toward the blocked direction and peaks halfway', () => {
    expect(bumpNudgeOffset('up', BUMP_NUDGE_MS / 2)).toEqual({ x: 0, y: -BUMP_NUDGE_TILES })
    const right = bumpNudgeOffset('right', BUMP_NUDGE_MS / 4)
    expect(right.x).toBeGreaterThan(0)
    expect(right.x).toBeLessThan(BUMP_NUDGE_TILES)
    expect(right.y).toBeCloseTo(0)
  })

  it('rests at the tile before and after the nudge', () => {
    for (const elapsed of [-1, BUMP_NUDGE_MS, BUMP_NUDGE_MS * 10, Number.POSITIVE_INFINITY]) {
      expect(bumpNudgeOffset('left', elapsed)).toEqual({ x: 0, y: 0 })
    }
    const start = bumpNudgeOffset('down', 0)
    expect(start.x).toBeCloseTo(0)
    expect(start.y).toBeCloseTo(0)
  })
})
