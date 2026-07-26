import type { CraftState, EngineEvent, EngineState, Vec2 } from '../gameTypes'
import {
  ARROW_BOOST_SPEED,
  ARROW_GRACE_SEC,
  ARROW_PAD_RADIUS,
  CRAFT_RADIUS,
  cycleForRound,
  droneSpeedScaleForRound,
  FLAG_PICKUP_RADIUS,
  FLAG_START_VALUE,
  MAX_SPEED,
  POD_PICKUP_RADIUS,
  POD_RESPAWN_SEC,
  SLOW_DOWN_MULTIPLIER,
  SLOW_DOWN_SEC,
  SPEED_BOOST_MULTIPLIER,
  SPEED_BOOST_SEC,
  TRAP_GRACE_SEC,
  TRAP_HALF_EXTENT,
  TRAP_HOLD_SEC,
} from '../gameTypes'
import type { InputState } from '../input/inputState'
import { mapForRound } from '../maps/maps'
import { cellCenter, compassVector } from '../maps/mapTypes'
import { computeDroneInput, createDroneBrain, headingTowards } from './droneAi'
import { resolveCraftCollision, stepCraftPhysics } from './physics'
import type { Rng } from './rng'
import { currentFlagValue, mapBonusForCycle } from './scoring'
import { spawnRound } from './spawning'

export interface CreateEngineOptions {
  roundIndex: number
  rng: Rng
  /** Cumulative score carried into this round. */
  score?: number
  /** Consecutive losses already accrued on this map. */
  lossesOnMap?: number
}

export function createEngineState(options: CreateEngineOptions): EngineState {
  const { roundIndex, rng } = options
  const map = mapForRound(roundIndex)
  const cycle = cycleForRound(roundIndex)
  const { flags, pods, traps } = spawnRound(map, cycle, rng)

  const playerPos = cellCenter(map, map.playerSpawn)
  const dronePos = cellCenter(map, map.enemySpawn)
  const center: Vec2 = { x: (map.cols * map.cellSize) / 2, z: (map.rows.length * map.cellSize) / 2 }

  return {
    map,
    cycle,
    roundIndex,
    lossesOnMap: options.lossesOnMap ?? 0,
    player: createCraft(playerPos, center),
    drone: createCraft(dronePos, center),
    droneBrain: createDroneBrain(),
    flags,
    pods,
    traps,
    score: options.score ?? 0,
    mapScore: 0,
    flagValue: FLAG_START_VALUE,
    elapsedSec: 0,
    outcome: 'playing',
    prevJumpHeld: false,
  }
}

function createCraft(pos: Vec2, faceTowards: Vec2): CraftState {
  return {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    heading: headingTowards({ x: faceTowards.x - pos.x, z: faceTowards.z - pos.z }),
    angularVel: 0,
    altitude: 0,
    verticalVel: 0,
    airborne: false,
    radius: CRAFT_RADIUS,
    speedEffect: null,
    hasJumpPower: false,
    stuckSec: 0,
    trapGraceSec: 0,
    arrowGraceSec: 0,
  }
}

/**
 * The single fixed-timestep update: advances both crafts, resolves pickups,
 * decay, and win/lose. Mutates state and returns this step's events (SFX /
 * HUD cues). Call with DT-sized dt from the render loop's accumulator.
 */
export function stepEngine(state: EngineState, input: InputState, dt: number): EngineEvent[] {
  if (state.outcome !== 'playing') {
    return []
  }

  const events: EngineEvent[] = []
  state.elapsedSec += dt
  state.flagValue = currentFlagValue(state.elapsedSec)

  for (const pod of state.pods) {
    // Jump pods are one-shot: the power lasts the whole round, so a respawn
    // would just be clutter.
    if (!pod.active && pod.kind !== 'jump') {
      pod.respawnSec -= dt
      if (pod.respawnSec <= 0) {
        pod.active = true
      }
    }
  }

  const jumpPressed = input.jumpHeld && !state.prevJumpHeld
  state.prevJumpHeld = input.jumpHeld

  events.push(...stepCraftPhysics(state.player, input, state.map, dt, jumpPressed))

  const droneInput = computeDroneInput(state, dt)
  const droneEvents = stepCraftPhysics(state.drone, droneInput, state.map, dt, false, {
    speedScale: droneSpeedScaleForRound(state.roundIndex),
  })
  events.push(...droneEvents.map((event) => ({ ...event, actor: 'drone' as const })))

  const bumpSpeed = resolveCraftCollision(state.player, state.drone)
  if (bumpSpeed > 0.5) {
    events.push({ kind: 'craftBump', actor: 'player', intensity: Math.min(1, bumpSpeed / 20) })
  }

  applyTraps(state, events)
  applyArrowPads(state, events)
  collectFlags(state, events)
  collectPods(state, events)
  resolveOutcome(state, events)

  return events
}

/**
 * A grounded craft touching a trap square gets glued for TRAP_HOLD_SEC. The
 * grace window (which outlasts the hold) prevents an instant re-grab while
 * the craft escapes. Crafts can be bumped into traps by the other craft —
 * that emerges from the elastic craft-craft collision, no special case.
 */
function applyTraps(state: EngineState, events: EngineEvent[]): void {
  for (const [craft, actor] of [
    [state.player, 'player'],
    [state.drone, 'drone'],
  ] as const) {
    if (craft.stuckSec > 0 || craft.trapGraceSec > 0 || craft.airborne || craft.altitude > 0.3) {
      continue
    }
    for (const trap of state.traps) {
      if (Math.abs(craft.pos.x - trap.pos.x) <= TRAP_HALF_EXTENT && Math.abs(craft.pos.z - trap.pos.z) <= TRAP_HALF_EXTENT) {
        craft.stuckSec = TRAP_HOLD_SEC
        craft.trapGraceSec = TRAP_HOLD_SEC + TRAP_GRACE_SEC
        craft.vel.x = 0
        craft.vel.z = 0
        events.push({ kind: 'trapped', actor })
        break
      }
    }
  }
}

/**
 * Directional arrow pads (original Hover! element): a grounded craft crossing
 * one is snapped to the arrow's heading and shoved along it at boost speed.
 */
function applyArrowPads(state: EngineState, events: EngineEvent[]): void {
  if (state.map.arrowPads.length === 0) {
    return
  }

  for (const [craft, actor] of [
    [state.player, 'player'],
    [state.drone, 'drone'],
  ] as const) {
    if (craft.stuckSec > 0 || craft.arrowGraceSec > 0 || craft.altitude > 0.3) {
      continue
    }
    for (const pad of state.map.arrowPads) {
      const center = cellCenter(state.map, pad.cell)
      const dx = craft.pos.x - center.x
      const dz = craft.pos.z - center.z
      if (dx * dx + dz * dz > ARROW_PAD_RADIUS * ARROW_PAD_RADIUS) {
        continue
      }
      const dir = compassVector(pad.dir)
      const speed = Math.max(ARROW_BOOST_SPEED, Math.hypot(craft.vel.x, craft.vel.z))
      craft.heading = headingTowards(dir)
      craft.angularVel = 0
      craft.vel.x = dir.x * speed
      craft.vel.z = dir.z * speed
      // A short boost window keeps the shove above the speed clamp — and it
      // must override a slowDown, or the very next substep clamps the fling
      // to slow speed. A stronger active boost is kept (its clamp is higher).
      const boostMultiplier = ARROW_BOOST_SPEED / MAX_SPEED
      if (!craft.speedEffect || craft.speedEffect.multiplier < boostMultiplier) {
        craft.speedEffect = { kind: 'boost', multiplier: boostMultiplier, remainingSec: 1.2 }
      }
      craft.arrowGraceSec = ARROW_GRACE_SEC
      events.push({ kind: 'arrow', actor })
      break
    }
  }
}

function collectFlags(state: EngineState, events: EngineEvent[]): void {
  for (const flag of state.flags) {
    if (flag.collected) {
      continue
    }

    if (flag.team === 'blue' && within(state.player.pos, flag.pos, FLAG_PICKUP_RADIUS)) {
      flag.collected = true
      state.score += state.flagValue
      state.mapScore += state.flagValue
      events.push({ kind: 'flagBlue', actor: 'player' })
    } else if (flag.team === 'red' && within(state.drone.pos, flag.pos, FLAG_PICKUP_RADIUS)) {
      flag.collected = true
      events.push({ kind: 'flagRed', actor: 'drone' })
    }
  }
}

function collectPods(state: EngineState, events: EngineEvent[]): void {
  for (const pod of state.pods) {
    if (!pod.active) {
      continue
    }

    const byPlayer = within(state.player.pos, pod.pos, POD_PICKUP_RADIUS)
    const byDrone = !byPlayer && within(state.drone.pos, pod.pos, POD_PICKUP_RADIUS)
    if (!byPlayer && !byDrone) {
      continue
    }
    if (byDrone && pod.kind === 'jump') {
      // The drone never jumps, so it leaves spring pods for the player
      // instead of silently wasting them.
      continue
    }

    const craft = byPlayer ? state.player : state.drone
    if (pod.kind === 'speedUp') {
      craft.speedEffect = { kind: 'boost', multiplier: SPEED_BOOST_MULTIPLIER, remainingSec: SPEED_BOOST_SEC }
    } else if (pod.kind === 'slowDown') {
      craft.speedEffect = { kind: 'slow', multiplier: SLOW_DOWN_MULTIPLIER, remainingSec: SLOW_DOWN_SEC }
    } else {
      craft.hasJumpPower = true
    }

    pod.active = false
    pod.respawnSec = POD_RESPAWN_SEC
    events.push({ kind: 'pod', actor: byPlayer ? 'player' : 'drone', podKind: pod.kind })
  }
}

function resolveOutcome(state: EngineState, events: EngineEvent[]): void {
  const blueRemaining = state.flags.some((flag) => flag.team === 'blue' && !flag.collected)
  const redRemaining = state.flags.some((flag) => flag.team === 'red' && !flag.collected)

  if (!blueRemaining) {
    const bonus = mapBonusForCycle(state.cycle)
    state.score += bonus
    state.mapScore += bonus
    state.outcome = 'won'
    events.push({ kind: 'win', actor: 'player' })
  } else if (!redRemaining) {
    state.outcome = 'lost'
    events.push({ kind: 'lose', actor: 'drone' })
  }
}

function within(a: Vec2, b: Vec2, radius: number): boolean {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz <= radius * radius
}
