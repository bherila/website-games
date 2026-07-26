import type { CraftState, EngineEvent } from '../gameTypes'
import {
  CRAFT_RESTITUTION,
  DRAG,
  GRAVITY,
  headingForward,
  JUMP_VELOCITY,
  LATERAL_GRIP,
  MAX_SPEED,
  REVERSE_ACCEL,
  THRUST_ACCEL,
  TURN_RATE,
  TURN_SMOOTHING,
  WALL_RESTITUTION,
} from '../gameTypes'
import type { InputState } from '../input/inputState'
import type { MapDef } from '../maps/mapTypes'
import { cellKindAt, groundHeightAt } from '../maps/mapTypes'
import { isSolidAtAltitude, MOUNT_TOLERANCE } from './grid'

/** Driving off a drop taller than this starts a fall instead of a snap-down. */
const EDGE_DROP_THRESHOLD = 0.25

export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a > Math.PI) {
    a -= Math.PI * 2
  }
  if (a <= -Math.PI) {
    a += Math.PI * 2
  }
  return a
}

export function craftSpeed(craft: CraftState): number {
  return Math.hypot(craft.vel.x, craft.vel.z)
}

export interface CraftStepOptions {
  /** Scales max speed and acceleration (drone difficulty knob). Default 1. */
  speedScale?: number
}

/**
 * Advances one craft by dt: steering, thrust, drag/drift, jump arc, and
 * circle-vs-grid-wall collision with springy reflection. Mutates the craft;
 * returns any bounce/jump/land events for SFX.
 */
export function stepCraftPhysics(
  craft: CraftState,
  input: InputState,
  map: MapDef,
  dt: number,
  jumpPressed: boolean,
  options: CraftStepOptions = {},
): EngineEvent[] {
  const events: EngineEvent[] = []

  if (craft.stuckSec > 0) {
    craft.stuckSec = Math.max(0, craft.stuckSec - dt)
    craft.vel.x = 0
    craft.vel.z = 0
    craft.angularVel = 0
    tickTimers(craft, dt)
    return events
  }

  const speedScale = options.speedScale ?? 1
  const effectMultiplier = craft.speedEffect?.multiplier ?? 1
  const maxSpeed = MAX_SPEED * speedScale * effectMultiplier

  const targetAngularVel = input.turn * TURN_RATE
  craft.angularVel += (targetAngularVel - craft.angularVel) * Math.min(1, TURN_SMOOTHING * dt)
  craft.heading = normalizeAngle(craft.heading + craft.angularVel * dt)

  const forward = headingForward(craft.heading)
  const right = { x: -forward.z, z: forward.x }
  const accel = (input.thrust >= 0 ? THRUST_ACCEL : REVERSE_ACCEL) * speedScale * effectMultiplier
  const strafeAccel = THRUST_ACCEL * speedScale * effectMultiplier
  craft.vel.x += forward.x * input.thrust * accel * dt
  craft.vel.z += forward.z * input.thrust * accel * dt
  craft.vel.x += right.x * -input.strafe * strafeAccel * dt
  craft.vel.z += right.z * -input.strafe * strafeAccel * dt

  const dragScale = Math.max(0, 1 - DRAG * dt)
  craft.vel.x *= dragScale
  craft.vel.z *= dragScale

  const forwardSpeed = craft.vel.x * forward.x + craft.vel.z * forward.z
  const lateralX = craft.vel.x - forward.x * forwardSpeed
  const lateralZ = craft.vel.z - forward.z * forwardSpeed
  const gripScale = Math.max(0, 1 - (map.physics?.lateralGrip ?? LATERAL_GRIP) * dt)
  craft.vel.x = forward.x * forwardSpeed + lateralX * gripScale
  craft.vel.z = forward.z * forwardSpeed + lateralZ * gripScale

  const speed = craftSpeed(craft)
  if (speed > maxSpeed) {
    const clamp = maxSpeed / speed
    craft.vel.x *= clamp
    craft.vel.z *= clamp
  }

  if (jumpPressed && !craft.airborne && craft.hasJumpPower) {
    craft.airborne = true
    craft.verticalVel = JUMP_VELOCITY
    events.push({ kind: 'jump', actor: 'player' })
  }

  craft.pos.x += craft.vel.x * dt
  craft.pos.z += craft.vel.z * dt

  const bounce = resolveWallCollisions(craft, map)
  if (bounce > 0.15) {
    events.push({ kind: 'bounce', actor: 'player', intensity: Math.min(1, bounce / MAX_SPEED) })
  }

  const ground = groundHeightAt(map, craft.pos.x, craft.pos.z)
  if (craft.airborne) {
    craft.verticalVel -= GRAVITY * dt
    craft.altitude += craft.verticalVel * dt
    if (craft.altitude <= ground && craft.verticalVel <= 0) {
      craft.altitude = ground
      craft.verticalVel = 0
      craft.airborne = false
      events.push({ kind: 'land', actor: 'player' })
    }
  } else if (craft.altitude > ground + EDGE_DROP_THRESHOLD) {
    // Drove off a platform edge or ramp end — fall, don't teleport down.
    craft.airborne = true
    craft.verticalVel = 0
  } else {
    // Grounded hover tracks the surface (up ramps, along platforms).
    craft.altitude = ground
  }

  tickTimers(craft, dt)

  return events
}

function tickTimers(craft: CraftState, dt: number): void {
  craft.trapGraceSec = Math.max(0, craft.trapGraceSec - dt)
  craft.arrowGraceSec = Math.max(0, craft.arrowGraceSec - dt)
  if (craft.speedEffect) {
    craft.speedEffect.remainingSec -= dt
    if (craft.speedEffect.remainingSec <= 0) {
      craft.speedEffect = null
    }
  }
}

/**
 * Pushes the craft out of any overlapping wall cells (3×3 neighborhood) and
 * reflects velocity with restitution. Returns the largest normal impact
 * speed, 0 if no contact.
 */
export function resolveWallCollisions(craft: CraftState, map: MapDef): number {
  let maxImpact = 0
  const restitution = map.physics?.wallRestitution ?? WALL_RESTITUTION
  const centerCol = Math.floor(craft.pos.x / map.cellSize)
  const centerRow = Math.floor(craft.pos.z / map.cellSize)

  for (let row = centerRow - 1; row <= centerRow + 1; row++) {
    for (let col = centerCol - 1; col <= centerCol + 1; col++) {
      const kind = cellKindAt(map, col, row)
      if (kind === 'floor') {
        continue
      }

      const minX = col * map.cellSize
      const minZ = row * map.cellSize
      const closestX = Math.max(minX, Math.min(craft.pos.x, minX + map.cellSize))
      const closestZ = Math.max(minZ, Math.min(craft.pos.z, minZ + map.cellSize))

      // Ramp faces are solid against the LOCAL slope height at the contact
      // point: driving up the slope stays passable, but the side faces and
      // the tall uphill face block like walls (no more teleport-up entry).
      const solid =
        kind === 'ramp'
          ? craft.altitude < groundHeightAt(map, closestX, closestZ) - MOUNT_TOLERANCE
          : isSolidAtAltitude(map, col, row, craft.altitude)
      if (!solid) {
        continue
      }

      const dx = craft.pos.x - closestX
      const dz = craft.pos.z - closestZ
      const distSq = dx * dx + dz * dz
      if (distSq >= craft.radius * craft.radius) {
        continue
      }

      let normalX: number
      let normalZ: number
      let penetration: number
      if (distSq > 1e-9) {
        const dist = Math.sqrt(distSq)
        normalX = dx / dist
        normalZ = dz / dist
        penetration = craft.radius - dist
      } else {
        const fromCellX = craft.pos.x - (minX + map.cellSize / 2)
        const fromCellZ = craft.pos.z - (minZ + map.cellSize / 2)
        if (Math.abs(fromCellX) > Math.abs(fromCellZ)) {
          normalX = Math.sign(fromCellX) || 1
          normalZ = 0
        } else {
          normalX = 0
          normalZ = Math.sign(fromCellZ) || 1
        }
        penetration = craft.radius
      }

      craft.pos.x += normalX * penetration
      craft.pos.z += normalZ * penetration

      const velAlongNormal = craft.vel.x * normalX + craft.vel.z * normalZ
      if (velAlongNormal < 0) {
        const impulse = -(1 + restitution) * velAlongNormal
        craft.vel.x += normalX * impulse
        craft.vel.z += normalZ * impulse
        maxImpact = Math.max(maxImpact, -velAlongNormal)
      }
    }
  }

  return maxImpact
}

/** A jumping craft clears the other once its altitude gap exceeds this. */
export const CRAFT_VERTICAL_CLEARANCE = 1.4

/**
 * Elastic circle-circle bounce between the two crafts (equal mass). Returns
 * the impact speed, 0 when not touching or when one craft is flying above
 * the other (mirrors how wall collisions respect altitude).
 */
export function resolveCraftCollision(a: CraftState, b: CraftState): number {
  if (Math.abs(a.altitude - b.altitude) > CRAFT_VERTICAL_CLEARANCE) {
    return 0
  }

  const dx = b.pos.x - a.pos.x
  const dz = b.pos.z - a.pos.z
  const dist = Math.hypot(dx, dz)
  const minDist = a.radius + b.radius
  if (dist >= minDist || dist < 1e-9) {
    return 0
  }

  const normalX = dx / dist
  const normalZ = dz / dist
  const overlap = minDist - dist
  a.pos.x -= (normalX * overlap) / 2
  a.pos.z -= (normalZ * overlap) / 2
  b.pos.x += (normalX * overlap) / 2
  b.pos.z += (normalZ * overlap) / 2

  const relVel = (b.vel.x - a.vel.x) * normalX + (b.vel.z - a.vel.z) * normalZ
  if (relVel >= 0) {
    return 0
  }

  const impulse = (-(1 + CRAFT_RESTITUTION) * relVel) / 2
  a.vel.x -= normalX * impulse
  a.vel.z -= normalZ * impulse
  b.vel.x += normalX * impulse
  b.vel.z += normalZ * impulse

  return -relVel
}
