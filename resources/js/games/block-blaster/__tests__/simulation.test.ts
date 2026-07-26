import * as CANNON from 'cannon-es'

import type { LevelDef } from '../levels/levelTypes'
import { buildLevelWorld, platformAngularVelocity } from '../scene/physics/levelWorld'
import {
  carrierRelativeSpeeds,
  createSettleState,
  diffNewClearedIds,
  isBodyQuiet,
  type RelativeSpeeds,
  shouldRemoveBall,
  updateSettleState,
} from '../scene/physics/simulation'
import {
  BALL_KILL_Y,
  BALL_MAX_AGE_S,
  SETTLE_ANGULAR_SPEED,
  SETTLE_LINEAR_SPEED,
  SETTLE_QUIET_S,
  SETTLE_TIMEOUT_S,
} from '../scene/sceneConstants'

describe('isBodyQuiet', () => {
  it('is quiet when both speeds are below their thresholds', () => {
    expect(isBodyQuiet(SETTLE_LINEAR_SPEED / 2, SETTLE_ANGULAR_SPEED / 2)).toBe(true)
  })

  it('is not quiet when linear speed is at/above the threshold', () => {
    expect(isBodyQuiet(SETTLE_LINEAR_SPEED, 0)).toBe(false)
  })

  it('is not quiet when angular speed is at/above the threshold', () => {
    expect(isBodyQuiet(0, SETTLE_ANGULAR_SPEED)).toBe(false)
  })
})

describe('carrierRelativeSpeeds', () => {
  const out: RelativeSpeeds = { linearSpeed: 0, angularSpeed: 0 }

  it('sees a block perfectly riding a rotating platform as quiet in the platform frame', () => {
    const omega = 0.5
    const rx = 1.2
    const rz = -0.7
    carrierRelativeSpeeds({
      positionX: rx,
      positionZ: rz,
      velocityX: omega * rz,
      velocityY: 0,
      velocityZ: -omega * rx,
      angularVelocityX: 0,
      angularVelocityY: omega,
      angularVelocityZ: 0,
      carrierAngularVelocityY: omega,
      carrierCenterX: 0,
      carrierCenterZ: 0,
    }, out)

    expect(out.linearSpeed).toBeCloseTo(0, 6)
    expect(out.angularSpeed).toBeCloseTo(0, 6)
    expect(isBodyQuiet(out.linearSpeed, out.angularSpeed)).toBe(true)
  })

  it('still reports genuine motion on top of the carried motion', () => {
    const omega = 0.5
    carrierRelativeSpeeds({
      positionX: 1,
      positionZ: 0,
      velocityX: 0,
      velocityY: -2,
      velocityZ: -omega,
      angularVelocityX: 1,
      angularVelocityY: omega,
      angularVelocityZ: 0,
      carrierAngularVelocityY: omega,
      carrierCenterX: 0,
      carrierCenterZ: 0,
    }, out)

    expect(out.linearSpeed).toBeCloseTo(2, 6)
    expect(out.angularSpeed).toBeCloseTo(1, 6)
  })

  it('reduces to world speeds for a static carrier', () => {
    carrierRelativeSpeeds({
      positionX: 3,
      positionZ: 4,
      velocityX: 0.3,
      velocityY: 0.4,
      velocityZ: 0,
      angularVelocityX: 0,
      angularVelocityY: 0.2,
      angularVelocityZ: 0,
      carrierAngularVelocityY: 0,
      carrierCenterX: 0,
      carrierCenterZ: 0,
    }, out)

    expect(out.linearSpeed).toBeCloseTo(0.5, 6)
    expect(out.angularSpeed).toBeCloseTo(0.2, 6)
  })
})

describe('shouldRemoveBall', () => {
  it('removes a ball that fell below the kill line', () => {
    expect(shouldRemoveBall({ y: BALL_KILL_Y - 0.1, isSleeping: false, age: 0.1 })).toBe(true)
  })

  it('removes a ball that has fallen asleep', () => {
    expect(shouldRemoveBall({ y: 2, isSleeping: true, age: 0.1 })).toBe(true)
  })

  it('removes a ball once it has aged past the max lifetime', () => {
    expect(shouldRemoveBall({ y: 2, isSleeping: false, age: BALL_MAX_AGE_S })).toBe(true)
  })

  it('keeps a ball that is still in flight, awake, and young', () => {
    expect(shouldRemoveBall({ y: 2, isSleeping: false, age: 0.5 })).toBe(false)
  })
})

describe('diffNewClearedIds', () => {
  it('returns only ids present in current but not previous', () => {
    const previous = new Set(['a', 'b'])
    const current = new Set(['a', 'b', 'c'])
    expect(diffNewClearedIds(previous, current)).toEqual(['c'])
  })

  it('returns an empty array when nothing new was added', () => {
    const previous = new Set(['a'])
    const current = new Set(['a'])
    expect(diffNewClearedIds(previous, current)).toEqual([])
  })
})

describe('updateSettleState (lose detection)', () => {
  const baseParams = {
    ballsRemaining: 0,
    liveBallCount: 0,
    remainingBlockCount: 1,
    allBlocksQuiet: true,
    blockClearedThisFrame: false,
    dt: 1 / 60,
  }

  it('does not fire while balls remain or are still in flight', () => {
    const state = createSettleState()
    expect(updateSettleState(state, { ...baseParams, ballsRemaining: 2 })).toBe(false)
    expect(updateSettleState(state, { ...baseParams, liveBallCount: 1 })).toBe(false)
  })

  it.each([60, 120])('fires after the same quiet duration at %i Hz', (refreshRate) => {
    const state = createSettleState()
    const dt = 1 / refreshRate
    const framesBeforeThreshold = Math.ceil(SETTLE_QUIET_S / dt) - 1
    for (let i = 0; i < framesBeforeThreshold; i += 1) {
      expect(updateSettleState(state, { ...baseParams, dt })).toBe(false)
    }
    expect(updateSettleState(state, { ...baseParams, dt })).toBe(true)
    expect(updateSettleState(state, { ...baseParams, dt })).toBe(false)
  })

  it('does not fire before quiescence, and does not fire again after firing once', () => {
    const state = createSettleState()
    const framesBeforeThreshold = Math.ceil(SETTLE_QUIET_S / baseParams.dt) - 1
    for (let i = 0; i < framesBeforeThreshold; i += 1) {
      expect(updateSettleState(state, baseParams)).toBe(false)
    }
    expect(updateSettleState(state, baseParams)).toBe(true)
    expect(updateSettleState(state, baseParams)).toBe(false)
  })

  it('a block clearing during the wait restarts the quiescence count', () => {
    const state = createSettleState()
    const framesBeforeThreshold = Math.ceil(SETTLE_QUIET_S / baseParams.dt) - 1
    for (let i = 0; i < framesBeforeThreshold; i += 1) {
      expect(updateSettleState(state, baseParams)).toBe(false)
    }
    // One frame before it would have fired, a block clears — this must cancel/restart the wait.
    expect(updateSettleState(state, { ...baseParams, blockClearedThisFrame: true })).toBe(false)
    for (let i = 0; i < framesBeforeThreshold; i += 1) {
      expect(updateSettleState(state, baseParams)).toBe(false)
    }
    expect(updateSettleState(state, baseParams)).toBe(true)
  })

  it('fires via the timeout even if frames never go fully quiet', () => {
    const state = createSettleState()
    const noisyParams = { ...baseParams, allBlocksQuiet: false, dt: 1 }
    let fired = false
    for (let i = 0; i < Math.ceil(SETTLE_TIMEOUT_S) + 1; i += 1) {
      if (updateSettleState(state, noisyParams)) {
        fired = true
        break
      }
    }
    expect(fired).toBe(true)
  })

  it('never fires while blocks remain at zero (win path, not lose)', () => {
    const state = createSettleState()
    for (let i = 0; i < Math.ceil(SETTLE_QUIET_S / baseParams.dt) + 5; i += 1) {
      expect(updateSettleState(state, { ...baseParams, remainingBlockCount: 0 })).toBe(false)
    }
  })
})

describe('platformAngularVelocity oscillate continuity', () => {
  it('is a continuous function of elapsed time (no jump at any sample point)', () => {
    const def = {
      shape: 'round' as const,
      radius: 2,
      topY: 2,
      center: [0, 0] as [number, number],
      rotation: { mode: 'oscillate' as const, speedDegPerSec: 35, maxAngleDeg: 90 },
      blocks: [],
    }

    const dt = 1 / 240
    let previous = platformAngularVelocity(def, 0)
    for (let t = dt; t <= 4; t += dt) {
      const current = platformAngularVelocity(def, t)
      expect(Math.abs(current - previous)).toBeLessThan(0.05)
      previous = current
    }
  })

  it('continuous mode holds a constant angular velocity', () => {
    const def = {
      shape: 'round' as const,
      radius: 2,
      topY: 2,
      center: [0, 0] as [number, number],
      rotation: { mode: 'continuous' as const, speedDegPerSec: 18 },
      blocks: [],
    }
    const expected = 18 * (Math.PI / 180)
    expect(platformAngularVelocity(def, 0)).toBeCloseTo(expected)
    expect(platformAngularVelocity(def, 100)).toBeCloseTo(expected)
  })
})

describe('cleared latch (via the real buildLevelWorld/step, shared physics — extend-only)', () => {
  it('keeps a block latched as cleared even if it is later moved back above the threshold', () => {
    const level: LevelDef = {
      id: 1,
      balls: 1,
      starThresholds: { twoStar: 0, threeStar: 0 },
      platforms: [
        {
          shape: 'round',
          radius: 2,
          topY: 2,
          center: [0, 0],
          blocks: [{ type: 'crate', position: [0, 0, 0] }],
        },
      ],
    }

    const levelWorld = buildLevelWorld(level)
    const block = levelWorld.blocks[0]
    expect(block).toBeDefined()
    if (!block) {
      return
    }

    // Force the block below the clear threshold directly, bypassing normal physics.
    block.body.position.set(0, -10, 0)
    block.body.velocity.set(0, 0, 0)
    levelWorld.step(1 / 60)
    expect(levelWorld.clearedBlockIds.has(block.id)).toBe(true)

    // Teleport it back up (as if bodies later intersected/bounced) — must stay latched.
    block.body.position.set(0, 5, 0)
    levelWorld.step(1 / 60)
    expect(levelWorld.clearedBlockIds.has(block.id)).toBe(true)
  })
})

describe('CANNON import sanity (used indirectly by BlockBlasterScene for pooled ball bodies)', () => {
  it('a fresh sphere body is awake and above the sleep threshold by default', () => {
    const body = new CANNON.Body({ mass: 8, shape: new CANNON.Sphere(0.35) })
    expect(body.sleepState).toBe(CANNON.Body.AWAKE)
  })
})
