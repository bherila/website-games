import * as CANNON from 'cannon-es'

import { LEVELS } from '../levels/levels'
import { type RimObstacle, solveFromBarrelTip, solveRimClearingLaunch } from '../scene/aiming'
import { buildLevelWorld, platformAngularVelocity } from '../scene/physics/levelWorld'
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_SPEED,
  CANNON_BARREL_LENGTH,
  CANNON_MUZZLE_POSITION,
  CANNON_PIVOT_HEIGHT,
  GRAVITY_Y,
} from '../scene/sceneConstants'

const PIVOT = { x: CANNON_MUZZLE_POSITION[0], y: CANNON_PIVOT_HEIGHT, z: CANNON_MUZZLE_POSITION[2] }

interface ProbeResult {
  cleared: number
  total: number
  ballsUsed: number
}

/**
 * Greedy playability probe — a skill FLOOR for a competent player. Each ball targets the
 * nearest-to-cannon uncleared block, leads rotating platforms by the ball's time of flight, and
 * raises the aim until the trajectory lobs over the platform's near rim. Levels asserted below
 * must be beatable by this bot within their ball budget; a human player only does better.
 * Deterministic: fixed-step physics, no randomness.
 */
function probeLevel(levelId: number, maxBalls: number): ProbeResult {
  const level = LEVELS.find((candidate) => candidate.id === levelId)
  if (!level) {
    throw new Error(`no level ${levelId}`)
  }

  const world = buildLevelWorld(level)
  const rims: RimObstacle[] = level.platforms.map((platformDef) => ({
    z: platformDef.center[1] + platformDef.radius,
    topY: platformDef.topY,
    centerX: platformDef.center[0],
    halfWidth: platformDef.radius,
  }))
  const rimClearance = BALL_RADIUS + 0.05
  let ballsUsed = 0
  let lastTargetId: string | null = null
  let lastClearedCount = 0

  for (let shot = 0; shot < maxBalls; shot += 1) {
    const target = world.blocks
      .filter((block) => !world.clearedBlockIds.has(block.id))
      .sort((a, b) => (b.body.position.z - a.body.position.z) || (b.body.position.y - a.body.position.y))[0]
    if (!target) {
      break
    }

    // Players adapt: if the previous shot at this same block cleared nothing, shoot THROUGH it —
    // aim past the block so the rim-skimming arc strikes its front face on the way.
    const repeatShot = target.id === lastTargetId && world.clearedBlockIds.size === lastClearedCount
    lastTargetId = target.id
    lastClearedCount = world.clearedBlockIds.size

    const platform = world.platforms[target.platformIndex]
    const omega = platform?.def.rotation ? platformAngularVelocity(platform.def, world.elapsed) : 0
    // Tap slightly above the block center — players aim at the visible (upper) face of a
    // back-row block, and this keeps the rim-raise within the assist's contact window.
    let aim = repeatShot
      ? { x: target.body.position.x, y: target.body.position.y + 0.2, z: target.body.position.z - 1.4 }
      : { x: target.body.position.x, y: target.body.position.y + 0.2, z: target.body.position.z }
    if (platform && omega !== 0) {
      const first = solveFromBarrelTip(PIVOT, CANNON_BARREL_LENGTH, aim, BALL_SPEED, GRAVITY_Y)
      const sweep = omega * first.solution.timeOfFlight
      const cx = platform.def.center[0]
      const cz = platform.def.center[1]
      const dx = aim.x - cx
      const dz = aim.z - cz
      aim = {
        x: cx + (dx * Math.cos(sweep)) + (dz * Math.sin(sweep)),
        y: aim.y,
        z: cz - (dx * Math.sin(sweep)) + (dz * Math.cos(sweep)),
      }
    }

    // Same rim-aware solve the game's aim assist uses, so the probe exercises real trajectories.
    const launch = solveRimClearingLaunch(PIVOT, CANNON_BARREL_LENGTH, aim, BALL_SPEED, GRAVITY_Y, rims, rimClearance)

    const ball = new CANNON.Body({
      mass: BALL_MASS,
      shape: new CANNON.Sphere(BALL_RADIUS),
      material: world.handles.materials.ball,
    })
    ball.position.set(launch.origin.x, launch.origin.y, launch.origin.z)
    ball.velocity.set(launch.solution.velocity.x, launch.solution.velocity.y, launch.solution.velocity.z)
    world.handles.world.addBody(ball)
    ballsUsed += 1

    for (let i = 0; i < 300; i += 1) {
      world.step(1 / 60)
      if (ball.position.y < -5) {
        break
      }
    }
    world.handles.world.removeBody(ball)

    if (world.clearedBlockIds.size === world.blocks.length) {
      break
    }
  }

  for (let i = 0; i < 480; i += 1) {
    world.step(1 / 60)
  }

  return { cleared: world.clearedBlockIds.size, total: world.blocks.length, ballsUsed }
}

describe('playability probe (greedy-bot skill floor)', () => {
  it.each([1, 2, 3, 4, 5, 9, 12, 14, 15, 18, 22])('level %d is winnable by the greedy bot within its ball budget', (id) => {
    const level = LEVELS.find((candidate) => candidate.id === id)
    expect(level).toBeDefined()
    if (!level) {
      return
    }

    const result = probeLevel(id, level.balls)
    expect(result.cleared).toBe(result.total)
    expect(result.ballsUsed).toBeLessThanOrEqual(level.balls)
  })

  it('level 14 domino chain clears in a single shot', () => {
    const result = probeLevel(14, 1)
    expect(result.cleared).toBe(result.total)
  })
})
