import { TUNING } from '../../gameTypes'
import { getMap } from '../maps'
import { unlockedKindsAt } from '../stars'
import { popThresholdFor, runStarProgression } from './starProgressionScenario'

/**
 * Full star-progression + TOWER-completion soak. Unlike `scenarios.ts` (which
 * fast-forwards the rating with
 * `applyStarUp`), this drives a fresh engine through the REAL thresholds: an
 * office block is built, leasing grows population past the 2★/3★ gates, and the
 * VIP visits those gates arm are driven to success through `stepEngine` — the
 * only code path that fires `starUp`. 4★/5★ use the engine's public
 * `applyStarUp` (their 5 000/10 000 population gates are impractical to grind in
 * a unit test and are covered arithmetically by `stars.test.ts`), then the
 * floor-99 cathedral + a vacant penthouse arm the final VIP to `towerAchieved`.
 *
 * TOWER completion rule (found in vip.ts `stepVips`/`startVisit` + engine.ts):
 * a standing, non-offline `cathedral` arms a one-time `target: 'tower'` VIP;
 * the visit needs a vacant, routable `aptPenthouse` up front (else auto-fail),
 * tours the cathedral, and on success sets `state.towerAchieved = true`, pushes
 * `towerAchieved` + `milestone: 'tower'`, and moves the VIP into the penthouse.
 * The crown is never revoked thereafter.
 */

const map = getMap('city-tower')

describe('legit star progression to TOWER', () => {
  it(
    'earns 2★/3★ through real population + VIP visits, then reaches 5★ and TOWER',
    () => {
      const t0 = performance.now()
      const result = runStarProgression()
      const runtimeMs = performance.now() - t0

      // ── The real 2★ threshold armed the first VIP while still at 1★. ──
      expect(result.popAfterFirstLease).toBeGreaterThanOrEqual(popThresholdFor(2))
      expect(result.armedForStar2AfterLease).toBe(true)

      // ── Legit 2★ and 3★ each fired a `starUp` via a VIP visit, at/above the
      //    population threshold, with the correct newly-unlocked kinds. ──
      const legit = result.transitions.filter((t) => t.method === 'vip')
      expect(legit.map((t) => t.toStar)).toEqual([2, 3])

      for (const transition of legit) {
        expect(transition.populationAtGrant).toBeGreaterThanOrEqual(popThresholdFor(transition.toStar as 2 | 3))
        // The engine reports exactly the kinds newly available at this star.
        const expectedUnlocks = new Set(unlockedKindsAt(transition.toStar, map))
        const priorUnlocks = new Set(unlockedKindsAt((transition.toStar - 1) as 1 | 2, map))
        const expectedNew = [...expectedUnlocks].filter((k) => !priorUnlocks.has(k)).sort()
        expect([...transition.starUp.unlocked].sort()).toEqual(expectedNew)
        expect(transition.starUp.bonus).toBe(TUNING.economy.starUpBonusPerStar * transition.toStar)
      }

      // Spot-check a couple of signature unlocks per the catalog star gates.
      const twoStar = legit.find((t) => t.toStar === 2)!
      expect(twoStar.starUp.unlocked).toEqual(expect.arrayContaining(['officeM', 'escalator', 'apt1br']))
      const threeStar = legit.find((t) => t.toStar === 3)!
      expect(threeStar.starUp.unlocked).toEqual(expect.arrayContaining(['apt2br', 'hotelReception', 'subway']))

      // ── The 4★ threshold (5 000) is NOT met by the ~1 000-pop office block, so
      //    the run stalls at 3★ until we invoke the public star-up. ──
      expect(result.armedForStar4AtCap).toBe(false)

      // ── 4★ and 5★ reached via the engine's public mechanism. ──
      const viaPublic = result.transitions.filter((t) => t.method === 'applyStarUp')
      expect(viaPublic.map((t) => t.toStar)).toEqual([4, 5])
      expect(result.state.star).toBe(5)
      expect(result.state.maxStarReached).toBe(5)

      // maxStarReached increments monotonically across every transition.
      let expected = 1
      for (const transition of result.transitions) {
        expected += 1
        expect(transition.toStar).toBe(expected)
      }

      // ── TOWER completion driven through the real engine loop. ──
      expect(result.towerAchieved).toBe(true)
      expect(result.state.towerAchieved).toBe(true)
      expect(result.towerEvents).toContainEqual({ type: 'vipArrived', target: 'tower' })
      expect(result.towerEvents).toContainEqual({ type: 'towerAchieved' })
      expect(result.towerEvents).toContainEqual({ type: 'milestone', milestone: 'tower' })
      expect(result.towerEvents).toContainEqual(
        expect.objectContaining({ type: 'vipResult', target: 'tower', success: true }),
      )

      // The guest of honor moved into a penthouse (population.vip === 1).
      const movedIn = result.towerEvents.find((e) => e.type === 'vipMovedIn')
      expect(movedIn).toMatchObject({ type: 'vipMovedIn', target: 'tower' })
      const penthouse = result.state.units.find((u) => u.kind === 'aptPenthouse')!
      expect(penthouse.population.vip).toBe(1)

      // Every star milestone plus the crown is recorded.
      expect(result.state.milestonesEarned).toEqual(
        expect.arrayContaining(['star2', 'star3', 'star4', 'star5', 'tower']),
      )

      // The step-count guard never tripped (regression tripwire); log runtime.
      expect(result.stepChunks).toBeLessThan(8000)
      console.log(
        `star progression: ${result.transitions.length} star-ups, ${result.stepChunks} chunks, ` +
          `pop ${result.popAfterFirstLease}, runtime ${runtimeMs.toFixed(0)}ms`,
      )
    },
    120_000,
  )
})
