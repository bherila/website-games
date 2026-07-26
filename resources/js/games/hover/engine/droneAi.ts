import type { DroneBrain, EngineState, Flag, Vec2 } from '../gameTypes'
import type { InputState } from '../input/inputState'
import { cellCenter } from '../maps/mapTypes'
import { cellKey, worldToCell } from './grid'
import { findPath } from './pathfinding'
import { craftSpeed, normalizeAngle } from './physics'

const WAYPOINT_REACHED_FRACTION = 0.45
const STALL_SPEED = 2.0
const STALL_SECONDS = 1.2
const REVERSE_SECONDS = 0.4
const REPATH_COOLDOWN_SEC = 0.5
const TURN_GAIN = 3

export function createDroneBrain(): DroneBrain {
  return {
    path: [],
    waypointIndex: 0,
    targetFlagId: null,
    stallTimer: 0,
    repathCooldown: 0,
    reverseTimer: 0,
  }
}

/** Heading that faces along direction d, matching headingForward's convention. */
export function headingTowards(d: Vec2): number {
  return Math.atan2(-d.x, -d.z)
}

/**
 * Produces the drone's InputState for this step: repath to the best red flag
 * when needed, follow waypoints, and back out briefly when stalled. The
 * output goes through the exact same physics step as the player's input.
 */
export function computeDroneInput(state: EngineState, dt: number): InputState {
  const brain = state.droneBrain
  const drone = state.drone
  brain.repathCooldown = Math.max(0, brain.repathCooldown - dt)

  const uncollected = state.flags.filter((flag) => flag.team === 'red' && !flag.collected)
  if (uncollected.length === 0) {
    return { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
  }

  let target = uncollected.find((flag) => flag.id === brain.targetFlagId) ?? null
  const needsPath = !target || brain.path.length === 0
  if (needsPath && brain.repathCooldown <= 0) {
    target ??= nearestTargetByPath(state, uncollected)
    if (target) {
      repath(state, target)
    }
  }
  if (!target) {
    return { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
  }

  trackStall(state, dt)

  if (brain.reverseTimer > 0) {
    brain.reverseTimer -= dt
    return { thrust: -0.7, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
  }

  const waypoint = nextWaypoint(state)
  if (!waypoint) {
    return { thrust: 0.3, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
  }

  const desired = { x: waypoint.x - drone.pos.x, z: waypoint.z - drone.pos.z }
  const angleError = normalizeAngle(headingTowards(desired) - drone.heading)
  const turn = Math.max(-1, Math.min(1, angleError * TURN_GAIN))
  const thrust = Math.max(0.15, Math.cos(angleError))

  return { thrust, strafe: 0, turn, lookPitch: 0, jumpHeld: false }
}

/** Trap cells the drone should route around (it can still be bumped in). */
function blockedCells(state: EngineState): ReadonlySet<string> {
  return new Set(state.traps.map((trap) => cellKey(trap.cell)))
}

function nearestTargetByPath(state: EngineState, uncollected: Flag[]): Flag | null {
  const droneCell = worldToCell(state.map, state.drone.pos)
  const blocked = blockedCells(state)
  let best: Flag | null = null
  let bestLength = Infinity
  for (const flag of uncollected) {
    // Prefer trap-avoiding routes; if a flag is only reachable THROUGH a
    // trap, risking the goo beats beelining into walls forever.
    const path = findPath(state.map, droneCell, flag.cell, blocked) ?? findPath(state.map, droneCell, flag.cell)
    if (path && path.length < bestLength) {
      bestLength = path.length
      best = flag
    }
  }
  return best ?? uncollected[0] ?? null
}

function repath(state: EngineState, target: Flag): void {
  const brain = state.droneBrain
  const droneCell = worldToCell(state.map, state.drone.pos)
  const path =
    findPath(state.map, droneCell, target.cell, blockedCells(state)) ?? findPath(state.map, droneCell, target.cell)

  brain.targetFlagId = target.id
  brain.path = path ? path.map((cell) => cellCenter(state.map, cell)) : []
  brain.waypointIndex = 0
  brain.repathCooldown = REPATH_COOLDOWN_SEC
}

function trackStall(state: EngineState, dt: number): void {
  const brain = state.droneBrain
  const drone = state.drone

  if (brain.reverseTimer <= 0 && craftSpeed(drone) < STALL_SPEED && brain.path.length > 0) {
    brain.stallTimer += dt
  } else {
    brain.stallTimer = 0
  }

  if (brain.stallTimer >= STALL_SECONDS) {
    brain.stallTimer = 0
    brain.reverseTimer = REVERSE_SECONDS
    brain.path = []
    brain.targetFlagId = null
    brain.repathCooldown = 0
  }
}

function nextWaypoint(state: EngineState): Vec2 | null {
  const brain = state.droneBrain
  const drone = state.drone
  const reachedDist = state.map.cellSize * WAYPOINT_REACHED_FRACTION

  while (brain.waypointIndex < brain.path.length) {
    const waypoint = brain.path[brain.waypointIndex]
    if (!waypoint) {
      return null
    }
    if (Math.hypot(waypoint.x - drone.pos.x, waypoint.z - drone.pos.z) > reachedDist) {
      return waypoint
    }
    brain.waypointIndex += 1
  }

  const target = state.flags.find((flag) => flag.id === brain.targetFlagId)
  return target && !target.collected ? target.pos : null
}
