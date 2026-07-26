import {
  cannonAimAngles,
  intersectAimPlane,
  sampleTrajectoryArc,
  solveFromBarrelTip,
  solveLowArcLaunch,
  solveRimClearingLaunch,
  trajectoryPositionAt,
  type Vec3Like,
} from '../scene/aiming'
import { BALL_SPEED, CANNON_BARREL_LENGTH, CANNON_MUZZLE_POSITION, GRAVITY_Y } from '../scene/sceneConstants'

const MUZZLE: Vec3Like = {
  x: CANNON_MUZZLE_POSITION[0],
  y: CANNON_MUZZLE_POSITION[1],
  z: CANNON_MUZZLE_POSITION[2],
}

describe('intersectAimPlane', () => {
  it('intersects a straight-down ray with the plane at the correct point', () => {
    const hit = intersectAimPlane({ x: 0, y: 5, z: 7 }, { x: 0, y: -1, z: -1 }, 0)
    expect(hit).not.toBeNull()
    expect(hit?.z).toBeCloseTo(0)
    expect(hit?.y).toBeCloseTo(-2)
  })

  it('returns null when the ray is parallel to the plane', () => {
    const hit = intersectAimPlane({ x: 0, y: 5, z: 7 }, { x: 1, y: 0, z: 0 }, 0)
    expect(hit).toBeNull()
  })

  it('returns null when the plane is behind the ray origin', () => {
    const hit = intersectAimPlane({ x: 0, y: 5, z: -7 }, { x: 0, y: 0, z: -1 }, 0)
    expect(hit).toBeNull()
  })
})

describe('solveLowArcLaunch', () => {
  const ranges: Vec3Like[] = [
    { x: 0, y: 2, z: 0 },
    { x: 1.5, y: 2.6, z: 0.4 },
    { x: -2, y: 3.2, z: -1 },
    { x: 0, y: 4.5, z: 2 },
    { x: 2.2, y: 2, z: -2.4 },
  ]

  it.each(ranges.map((target, index) => [index, target] as const))(
    'range #%i: trajectory passes through the aim point within tolerance',
    (_index, target) => {
      const solution = solveLowArcLaunch(MUZZLE, target, BALL_SPEED, GRAVITY_Y)
      expect(solution.usedFallback).toBe(false)

      const landed = trajectoryPositionAt(MUZZLE, solution.velocity, GRAVITY_Y, solution.timeOfFlight)
      expect(landed.x).toBeCloseTo(target.x, 3)
      expect(landed.y).toBeCloseTo(target.y, 3)
      expect(landed.z).toBeCloseTo(target.z, 3)

      const speed = Math.sqrt(
        (solution.velocity.x ** 2) + (solution.velocity.y ** 2) + (solution.velocity.z ** 2),
      )
      expect(speed).toBeCloseTo(BALL_SPEED, 3)
    },
  )

  it('picks the low arc (smaller elevation) root, not the lob', () => {
    const target = { x: 0, y: 2, z: 0 }
    const solution = solveLowArcLaunch(MUZZLE, target, BALL_SPEED, GRAVITY_Y)
    const elevation = Math.atan2(solution.velocity.y, Math.sqrt((solution.velocity.x ** 2) + (solution.velocity.z ** 2)))
    expect(elevation).toBeLessThan(Math.PI / 4)
  })

  it('falls back to a straight shot when the target is out of range', () => {
    const farTarget = { x: 0, y: 2, z: -500 }
    const solution = solveLowArcLaunch(MUZZLE, farTarget, BALL_SPEED, GRAVITY_Y)
    expect(solution.usedFallback).toBe(true)

    const speed = Math.sqrt(
      (solution.velocity.x ** 2) + (solution.velocity.y ** 2) + (solution.velocity.z ** 2),
    )
    expect(speed).toBeCloseTo(BALL_SPEED, 3)
    expect(Number.isFinite(solution.velocity.x)).toBe(true)
    expect(Number.isFinite(solution.velocity.y)).toBe(true)
    expect(Number.isFinite(solution.velocity.z)).toBe(true)
  })

  it('never produces NaN velocity for a target directly above the muzzle', () => {
    const target = { x: MUZZLE.x, y: MUZZLE.y + 4, z: MUZZLE.z }
    const solution = solveLowArcLaunch(MUZZLE, target, BALL_SPEED, GRAVITY_Y)
    expect(Number.isFinite(solution.velocity.x)).toBe(true)
    expect(Number.isFinite(solution.velocity.y)).toBe(true)
    expect(Number.isFinite(solution.velocity.z)).toBe(true)
    expect(Number.isNaN(solution.timeOfFlight)).toBe(false)
  })
})

describe('cannonAimAngles', () => {
  // createCannonMesh nests pitchPivot (rotates about local X) inside yawPivot (rotates about
  // world Y), with the barrel's unrotated "forward" pointing along local -Z. This test
  // reconstructs that exact rotation composition and asserts it reproduces the original launch
  // direction — a regression guard against the yaw/pitch formula silently drifting out of sync
  // with the mesh geometry it's meant to drive.
  const cases: Vec3Like[] = [
    { x: 0, y: 2, z: -10 },
    { x: 3, y: 1, z: -10 },
    { x: -4, y: 5, z: -8 },
    { x: 2, y: -1, z: -6 },
  ]

  it.each(cases.map((velocity, index) => [index, velocity] as const))(
    'case #%i: yaw+pitch reconstruct the launch direction',
    (_index, velocity) => {
      const { yaw, pitch } = cannonAimAngles(velocity)
      const speed = Math.sqrt((velocity.x ** 2) + (velocity.y ** 2) + (velocity.z ** 2))

      const cosPitch = Math.cos(pitch)
      const sinPitch = Math.sin(pitch)
      const afterPitch = { x: 0, y: sinPitch, z: -cosPitch }
      const cosYaw = Math.cos(yaw)
      const sinYaw = Math.sin(yaw)
      const worldDirection = {
        x: (cosYaw * afterPitch.x) + (sinYaw * afterPitch.z),
        y: afterPitch.y,
        z: (-sinYaw * afterPitch.x) + (cosYaw * afterPitch.z),
      }

      expect(worldDirection.x * speed).toBeCloseTo(velocity.x, 5)
      expect(worldDirection.y * speed).toBeCloseTo(velocity.y, 5)
      expect(worldDirection.z * speed).toBeCloseTo(velocity.z, 5)
    },
  )
})

describe('sampleTrajectoryArc', () => {
  it('samples the requested number of points, starting at the muzzle and ending at the target', () => {
    const target = { x: 0, y: 2, z: 0 }
    const solution = solveLowArcLaunch(MUZZLE, target, BALL_SPEED, GRAVITY_Y)
    const points = sampleTrajectoryArc(MUZZLE, solution, GRAVITY_Y, 10)

    expect(points).toHaveLength(10)
    expect(points[0]?.x).toBeCloseTo(MUZZLE.x)
    expect(points[0]?.y).toBeCloseTo(MUZZLE.y)
    expect(points[0]?.z).toBeCloseTo(MUZZLE.z)

    const last = points[points.length - 1]
    expect(last?.x).toBeCloseTo(target.x, 3)
    expect(last?.y).toBeCloseTo(target.y, 3)
    expect(last?.z).toBeCloseTo(target.z, 3)
  })
})

describe('solveFromBarrelTip', () => {
  const pivot: Vec3Like = { x: 0, y: 0.7, z: 7 }

  it('places the launch origin one barrel length from the pivot along the launch direction', () => {
    const target = { x: 1.5, y: 2.5, z: 0 }
    const { origin, solution } = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)

    const offset = Math.sqrt(
      ((origin.x - pivot.x) ** 2) + ((origin.y - pivot.y) ** 2) + ((origin.z - pivot.z) ** 2),
    )
    expect(offset).toBeCloseTo(CANNON_BARREL_LENGTH, 5)

    const speed = Math.sqrt((solution.velocity.x ** 2) + (solution.velocity.y ** 2) + (solution.velocity.z ** 2))
    const alignment = (
      ((origin.x - pivot.x) * solution.velocity.x)
      + ((origin.y - pivot.y) * solution.velocity.y)
      + ((origin.z - pivot.z) * solution.velocity.z)
    ) / (offset * speed)
    expect(alignment).toBeGreaterThan(0.99)
  })

  it.each([
    [{ x: 0, y: 2.5, z: 0 }],
    [{ x: 2, y: 3.5, z: 0 }],
    [{ x: -1.8, y: 5.0, z: -1 }],
  ])('trajectory from the tip passes through the aim point %j', (target) => {
    const { origin, solution } = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)
    const impact = trajectoryPositionAt(origin, solution.velocity, GRAVITY_Y, solution.timeOfFlight)

    expect(impact.x).toBeCloseTo(target.x, 3)
    expect(impact.y).toBeCloseTo(target.y, 3)
    expect(impact.z).toBeCloseTo(target.z, 3)
  })
})

describe('solveRimClearingLaunch', () => {
  const pivot: Vec3Like = { x: 0, y: 0.7, z: 7 }
  const rim = { z: 2.4, topY: 2, centerX: 0, halfWidth: 2.4 }
  const clearance = 0.4

  function heightAtRim(launch: { origin: Vec3Like, solution: { velocity: Vec3Like } }): number {
    const t = (rim.z - launch.origin.z) / launch.solution.velocity.z
    return launch.origin.y + (launch.solution.velocity.y * t) + (0.5 * GRAVITY_Y * t * t)
  }

  it('raises a rim-clipping shot until the trajectory clears the tabletop edge', () => {
    const target = { x: 0, y: 2.5, z: -1.5 }
    const plain = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)
    expect(heightAtRim(plain)).toBeLessThan(rim.topY + clearance)

    const assisted = solveRimClearingLaunch(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y, [rim], clearance)
    expect(heightAtRim(assisted)).toBeGreaterThan(rim.topY + clearance)
  })

  it('leaves an already-clear shot untouched', () => {
    const target = { x: 0, y: 5.5, z: 0 }
    const plain = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)
    const assisted = solveRimClearingLaunch(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y, [rim], clearance)
    expect(assisted.solution.velocity).toEqual(plain.solution.velocity)
  })

  it('does not assist a shot deliberately aimed below the tabletop', () => {
    const target = { x: 0, y: 1.0, z: 0 }
    const plain = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)
    const assisted = solveRimClearingLaunch(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y, [rim], clearance)
    expect(assisted.solution.velocity).toEqual(plain.solution.velocity)
  })

  it('ignores rims the trajectory passes beside (twin-pedestal shot at the other platform)', () => {
    const target = { x: -2.4, y: 2.5, z: -0.5 }
    const offPathRim = { z: 1.8, topY: 2, centerX: 2.4, halfWidth: 1.8 }
    const plain = solveFromBarrelTip(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y)
    const assisted = solveRimClearingLaunch(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y, [offPathRim], clearance)
    expect(assisted.solution.velocity).toEqual(plain.solution.velocity)
  })
})

describe('solveRimClearingLaunch mortar arc for flat tabletop pieces', () => {
  const pivot: Vec3Like = { x: 0, y: 0.7, z: 7 }
  const rim = { z: 3.0, topY: 2, centerX: 0, halfWidth: 3.0 }
  const clearance = 0.4

  it('hits a low flat target (beam lying on the table) at the exact tapped point, descending', () => {
    // A beam lying flat: center height topY + 0.375. The raised-aim strategy would fly over it.
    const target = { x: 0.5, y: 2.375, z: -1.0 }
    const launch = solveRimClearingLaunch(pivot, CANNON_BARREL_LENGTH, target, BALL_SPEED, GRAVITY_Y, [rim], clearance)

    const impact = trajectoryPositionAt(launch.origin, launch.solution.velocity, GRAVITY_Y, launch.solution.timeOfFlight)
    expect(impact.x).toBeCloseTo(target.x, 3)
    expect(impact.y).toBeCloseTo(target.y, 3)
    expect(impact.z).toBeCloseTo(target.z, 3)

    const verticalVelocityAtImpact = launch.solution.velocity.y + (GRAVITY_Y * launch.solution.timeOfFlight)
    expect(verticalVelocityAtImpact).toBeLessThan(0)

    const tRim = (rim.z - launch.origin.z) / launch.solution.velocity.z
    const yAtRim = launch.origin.y + (launch.solution.velocity.y * tRim) + (0.5 * GRAVITY_Y * tRim * tRim)
    expect(yAtRim).toBeGreaterThan(rim.topY + clearance)
  })
})
