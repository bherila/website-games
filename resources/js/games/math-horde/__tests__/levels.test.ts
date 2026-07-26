import { TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels'
import { runGreedyPilot } from '../pilot'

describe('Math Horde campaign', () => {
  it('defines twelve ordered levels', () => {
    expect(LEVELS).toHaveLength(TOTAL_LEVELS)
    expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1))
  })

  it('uses legal gate operations with unique pair ids', () => {
    const ids = new Set<string>()
    for (const level of LEVELS) {
      expect(level.gatePairs.length).toBeGreaterThanOrEqual(4)
      for (const gatePair of level.gatePairs) {
        expect(ids.has(gatePair.id)).toBe(false)
        ids.add(gatePair.id)
        for (const side of [gatePair.left, gatePair.right]) {
          expect(['add', 'sub', 'mul', 'div']).toContain(side.op)
          expect(Number.isInteger(side.value)).toBe(true)
          if (side.op === 'mul' || side.op === 'div') {
            expect(side.value).toBeGreaterThanOrEqual(2)
            expect(side.value).toBeLessThanOrEqual(3)
          } else {
            expect(side.value).toBeGreaterThanOrEqual(1)
            expect(side.value).toBeLessThanOrEqual(30)
          }
        }
      }
    }
  })

  it('keeps at least one non-subtract side in every pair', () => {
    for (const level of LEVELS) {
      for (const gatePair of level.gatePairs) {
        expect(gatePair.left.op === 'sub' && gatePair.right.op === 'sub').toBe(false)
      }
    }
  })

  it('gives every level a multiply gate and spreads all four operations across the campaign', () => {
    const ops = new Set<string>()
    for (const level of LEVELS) {
      const sides = level.gatePairs.flatMap((gatePair) => [gatePair.left, gatePair.right])
      expect(sides.some((side) => side.op === 'mul')).toBe(true)
      for (const side of sides) {
        ops.add(side.op)
      }
    }
    expect(ops).toEqual(new Set(['add', 'sub', 'mul', 'div']))
  })

  it('keeps the first two levels free of penalty gates', () => {
    for (const level of LEVELS.slice(0, 2)) {
      for (const gatePair of level.gatePairs) {
        expect(['add', 'mul']).toContain(gatePair.left.op)
        expect(['add', 'mul']).toContain(gatePair.right.op)
      }
    }
  })

  it('gives every level from the third onward at least one penalty gate', () => {
    for (const level of LEVELS.slice(2)) {
      const sides = level.gatePairs.flatMap((gatePair) => [gatePair.left, gatePair.right])
      expect(sides.some((side) => side.op === 'sub' || side.op === 'div')).toBe(true)
    }
  })

  it('places bosses on every third level', () => {
    expect(LEVELS.filter((level) => level.hordes.some((horde) => horde.boss)).map((level) => level.id)).toEqual([3, 6, 9, 12])
  })

  it('orders star thresholds sensibly', () => {
    for (const level of LEVELS) {
      const [twoStars, threeStars] = level.starArmyThresholds
      expect(twoStars).toBeGreaterThanOrEqual(2)
      expect(threeStars).toBeGreaterThan(twoStars)
    }
  })

  it('keeps every level completable with two stars by a deterministic greedy pilot', () => {
    for (const level of LEVELS) {
      const state = runGreedyPilot(level)
      if (state.status !== 'won' || state.armySize < level.starArmyThresholds[0]) {
        throw new Error(JSON.stringify({
          level: level.id,
          status: state.status,
          army: state.armySize,
          needed: level.starArmyThresholds[0],
          progress: Math.round(state.progress),
          gates: state.gatesClaimed,
        }))
      }
    }
  })
})
