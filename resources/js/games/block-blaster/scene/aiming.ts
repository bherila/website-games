/**
 * Pure ballistics + pointer-aiming math. No THREE/CANNON imports here on purpose — this module
 * stays framework-free so it can be unit-tested (acceptance D) without a renderer or DOM.
 */

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface LaunchSolution {
  velocity: Vec3Like
  /** Seconds until the ball reaches the target's horizontal distance from the muzzle. */
  timeOfFlight: number
  /** True when no low-arc solution existed in range and we fell back to a straight shot. */
  usedFallback: boolean
}

const MIN_HORIZONTAL_DISTANCE = 1e-6

/**
 * Intersects a camera ray with the vertical aim plane (constant world Z) that passes through the
 * platform center. Returns null when the ray is (near-)parallel to the plane, e.g. looking
 * straight along it.
 */
export function intersectAimPlane(origin: Vec3Like, direction: Vec3Like, planeZ: number): Vec3Like | null {
  if (Math.abs(direction.z) < 1e-9) {
    return null
  }

  const t = (planeZ - origin.z) / direction.z
  if (!Number.isFinite(t) || t < 0) {
    return null
  }

  return {
    x: origin.x + (direction.x * t),
    y: origin.y + (direction.y * t),
    z: planeZ,
  }
}

export type LaunchArc = 'low' | 'high'

/**
 * Solves the projectile launch velocity (fixed speed) that passes through `target` from `muzzle`
 * under gravity `gravityY` (signed, e.g. -18). A fixed launch speed admits two arcs through any
 * in-range point: `low` (flat, fast) and `high` (steep mortar lob that descends onto the target
 * from above). Falls back to a straight shot when no real solution exists (out of range) or the
 * target sits (almost) directly above or below the muzzle.
 */
export function solveArcLaunch(
  muzzle: Vec3Like,
  target: Vec3Like,
  speed: number,
  gravityY: number,
  arc: LaunchArc,
): LaunchSolution {
  const dx = target.x - muzzle.x
  const dy = target.y - muzzle.y
  const dz = target.z - muzzle.z
  const horizontalDistSq = (dx * dx) + (dz * dz)
  const horizontalDist = Math.sqrt(horizontalDistSq)
  const g = -gravityY

  if (horizontalDist < MIN_HORIZONTAL_DISTANCE || g <= 0 || speed <= 0) {
    return straightFallback(dx, dy, dz, speed)
  }

  const speedSq = speed * speed
  const discriminant = (speedSq * speedSq) - (g * ((g * horizontalDistSq) + (2 * dy * speedSq)))
  if (discriminant < 0) {
    return straightFallback(dx, dy, dz, speed)
  }

  const sqrtDiscriminant = Math.sqrt(discriminant)
  const angle = arc === 'low'
    ? Math.atan((speedSq - sqrtDiscriminant) / (g * horizontalDist))
    : Math.atan((speedSq + sqrtDiscriminant) / (g * horizontalDist))
  const horizontalSpeed = speed * Math.cos(angle)
  if (horizontalSpeed <= 1e-6) {
    return straightFallback(dx, dy, dz, speed)
  }

  const verticalSpeed = speed * Math.sin(angle)
  const ux = dx / horizontalDist
  const uz = dz / horizontalDist

  return {
    velocity: {
      x: ux * horizontalSpeed,
      y: verticalSpeed,
      z: uz * horizontalSpeed,
    },
    timeOfFlight: horizontalDist / horizontalSpeed,
    usedFallback: false,
  }
}

export function solveLowArcLaunch(
  muzzle: Vec3Like,
  target: Vec3Like,
  speed: number,
  gravityY: number,
): LaunchSolution {
  return solveArcLaunch(muzzle, target, speed, gravityY, 'low')
}

function straightFallback(dx: number, dy: number, dz: number, speed: number): LaunchSolution {
  const dist = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz)) || 1
  return {
    velocity: {
      x: (dx / dist) * speed,
      y: (dy / dist) * speed,
      z: (dz / dist) * speed,
    },
    timeOfFlight: dist / speed,
    usedFallback: true,
  }
}

export interface BarrelTipLaunch {
  /** World position of the barrel tip the projectile launches from. */
  origin: Vec3Like
  solution: LaunchSolution
}

/**
 * Solves a launch whose origin is the cannon's barrel TIP rather than its pivot. The tip position
 * depends on the aim direction (the barrel swings around the pivot), so this runs a two-pass
 * fixed-point step: solve from the pivot to get an approximate direction, place the tip
 * `barrelLength` along it, then re-solve from the tip. The residual angular error after one
 * re-solve is negligible for barrelLength << target distance.
 */
export function solveFromBarrelTip(
  pivot: Vec3Like,
  barrelLength: number,
  target: Vec3Like,
  speed: number,
  gravityY: number,
  arc: LaunchArc = 'low',
): BarrelTipLaunch {
  const first = solveArcLaunch(pivot, target, speed, gravityY, arc)
  const magnitude = Math.sqrt(
    (first.velocity.x * first.velocity.x)
    + (first.velocity.y * first.velocity.y)
    + (first.velocity.z * first.velocity.z),
  )
  if (magnitude < MIN_HORIZONTAL_DISTANCE) {
    return { origin: { ...pivot }, solution: first }
  }

  const origin: Vec3Like = {
    x: pivot.x + ((first.velocity.x / magnitude) * barrelLength),
    y: pivot.y + ((first.velocity.y / magnitude) * barrelLength),
    z: pivot.z + ((first.velocity.z / magnitude) * barrelLength),
  }

  return { origin, solution: solveArcLaunch(origin, target, speed, gravityY, arc) }
}

export interface RimObstacle {
  /** World Z of the platform's near rim (the edge facing the cannon). */
  z: number
  /** Height of the platform's top surface. */
  topY: number
  /** World X of the platform center and its horizontal half-width, to skip out-of-path rims. */
  centerX: number
  halfWidth: number
}

const RIM_RAISE_STEP = 0.25
const RIM_MAX_RAISES = 16
const RIM_LATERAL_MARGIN = 0.4

function isBlockedByRims(
  launch: BarrelTipLaunch,
  target: Vec3Like,
  gravityY: number,
  rims: readonly RimObstacle[],
  clearance: number,
): boolean {
  for (const rim of rims) {
    if (target.y < rim.topY - 0.2) {
      continue
    }
    const towardTarget = target.z < launch.origin.z ? rim.z < launch.origin.z && rim.z > target.z : rim.z > launch.origin.z && rim.z < target.z
    if (!towardTarget) {
      continue
    }
    const tRim = (rim.z - launch.origin.z) / launch.solution.velocity.z
    if (!Number.isFinite(tRim) || tRim <= 0) {
      continue
    }
    const xAtRim = launch.origin.x + (launch.solution.velocity.x * tRim)
    if (Math.abs(xAtRim - rim.centerX) > rim.halfWidth + RIM_LATERAL_MARGIN) {
      continue
    }
    const yAtRim = launch.origin.y + (launch.solution.velocity.y * tRim) + (0.5 * gravityY * tRim * tRim)
    if (yAtRim <= rim.topY + clearance) {
      return true
    }
  }

  return false
}

/**
 * How far above the tapped point a raised trajectory may pass and still count as making contact:
 * ball radius (0.35) plus the tapped block's bulk above the tap point (players tap somewhere on
 * a visible face; a crate tapped mid-face extends 0.5 above the tap). Flat pieces (planks 0.3,
 * beams 0.75 lying on the tabletop) fall outside this window and get the mortar arc instead.
 */
const RAISE_CONTACT_SLACK = 0.85

/**
 * Rim-aware launch solve: the cannon pivot sits well below the platform tops, so the plain
 * low-arc trajectory to a block at platform level clips the platform's near rim and the shot
 * dies on the tabletop edge.
 *
 * When the low arc is blocked, the aim point is raised in minimal steps until the trajectory
 * clears every rim — a near-flat shot whose mostly-horizontal impact is what actually knocks
 * blocks off the platform. If the required raise is so large that the ball would pass clean over
 * the tapped point (flat pieces — planks/beams lying on the tabletop), the HIGH arc through the
 * exact tapped point is used instead: a mortar lob that descends onto the piece rather than
 * overflying it. Rims are ignored when they are not between origin and target, when the
 * trajectory passes beside the platform, or when the player is deliberately aiming below the
 * tabletop (target.y under the rim top).
 */
export function solveRimClearingLaunch(
  pivot: Vec3Like,
  barrelLength: number,
  target: Vec3Like,
  speed: number,
  gravityY: number,
  rims: readonly RimObstacle[],
  clearance: number,
): BarrelTipLaunch {
  const lowLaunch = solveFromBarrelTip(pivot, barrelLength, target, speed, gravityY)
  if (!isBlockedByRims(lowLaunch, target, gravityY, rims, clearance)) {
    return lowLaunch
  }

  const aim: Vec3Like = { x: target.x, y: target.y, z: target.z }
  let raisedLaunch = lowLaunch
  let totalRaise = 0
  for (let raise = 0; raise < RIM_MAX_RAISES && isBlockedByRims(raisedLaunch, target, gravityY, rims, clearance); raise += 1) {
    aim.y += RIM_RAISE_STEP
    totalRaise += RIM_RAISE_STEP
    raisedLaunch = solveFromBarrelTip(pivot, barrelLength, aim, speed, gravityY)
  }

  if (totalRaise <= RAISE_CONTACT_SLACK) {
    return raisedLaunch
  }

  const highLaunch = solveFromBarrelTip(pivot, barrelLength, target, speed, gravityY, 'high')
  if (!highLaunch.solution.usedFallback && !isBlockedByRims(highLaunch, target, gravityY, rims, clearance)) {
    return highLaunch
  }

  return raisedLaunch
}

/** Position of a projectile launched from `origin` with `velocity` under gravity `gravityY` at time `t`. */
export function trajectoryPositionAt(origin: Vec3Like, velocity: Vec3Like, gravityY: number, t: number): Vec3Like {
  return {
    x: origin.x + (velocity.x * t),
    y: origin.y + (velocity.y * t) + (0.5 * gravityY * t * t),
    z: origin.z + (velocity.z * t),
  }
}

export interface CannonAimAngles {
  /** Rotation (radians) around world Y for the cannon's yaw pivot. */
  yaw: number
  /** Rotation (radians) around the yaw pivot's local X for the pitch pivot (positive = up). */
  pitch: number
}

/**
 * Converts a launch velocity into the cannon mesh's yaw/pitch pivot angles. The cannon model's
 * unrotated "forward" points along world -Z (muzzle sits at +Z, aiming back toward the platforms
 * near z=0), so yaw/pitch are solved against that basis — see createCannonMesh for the geometry.
 */
export function cannonAimAngles(velocity: Vec3Like): CannonAimAngles {
  const horizontalSpeed = Math.sqrt((velocity.x * velocity.x) + (velocity.z * velocity.z))
  const yaw = Math.atan2(-velocity.x, -velocity.z)
  const pitch = Math.atan2(velocity.y, horizontalSpeed)

  return { yaw, pitch }
}

/**
 * Samples `count` evenly-spaced points along a launch trajectory, for the wordless-hint ghost
 * dot-arc. Includes both endpoints (t=0 and t=timeOfFlight).
 */
export function sampleTrajectoryArc(
  origin: Vec3Like,
  solution: LaunchSolution,
  gravityY: number,
  count: number,
): Vec3Like[] {
  if (count < 2) {
    return [origin, trajectoryPositionAt(origin, solution.velocity, gravityY, solution.timeOfFlight)]
  }

  const points: Vec3Like[] = []
  for (let i = 0; i < count; i += 1) {
    const t = (i / (count - 1)) * solution.timeOfFlight
    points.push(trajectoryPositionAt(origin, solution.velocity, gravityY, t))
  }

  return points
}
