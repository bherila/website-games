import type {
  GameEvent,
  GameState,
  GateSideId,
  HudSnapshot,
  LevelDef,
  RuntimeGatePair,
  RuntimeGateSide,
  RuntimeHorde,
} from './gameTypes'
import { MAX_ARMY_SIZE } from './gameTypes'

export const TRACK_HALF_WIDTH = 2.6
export const GATE_SIDE_X = 1.3
const PLAYER_NOSE = 0.25
const STEER_SPEED = 10
export const FIRE_INTERVAL = 0.18
const SHOTS_PER_SOLDIER = 0.5
export const MAX_VOLLEY_SHOTS = 60
export const FIRE_RANGE = 20
const AIM_HALF_WIDTH = 1.5
const CLASH_DISTANCE = 0.9
const ESCAPE_BEHIND = 9
const BOSS_PULSE_RANGE = 14
const BOSS_HUD_RANGE = 30
const MAX_TICK_DELTA = 0.05
const MAX_EVENTS_PER_TICK = 256

interface UpgradeRule {
  shotsPerStep: number
  maxSteps: (baseValue: number) => number
  valueAt: (baseValue: number, steps: number) => number
}

const UPGRADE_RULES: Record<RuntimeGateSide['op'], UpgradeRule> = {
  add: { shotsPerStep: 3, maxSteps: () => 10, valueAt: (base, steps) => base + steps },
  sub: { shotsPerStep: 3, maxSteps: (base) => base, valueAt: (base, steps) => Math.max(0, base - steps) },
  mul: { shotsPerStep: 10, maxSteps: () => 1, valueAt: (base, steps) => base + steps },
  div: { shotsPerStep: 10, maxSteps: (base) => Math.max(0, base - 1), valueAt: (base, steps) => Math.max(1, base - steps) },
}

export function createGameState(level: LevelDef): GameState {
  return {
    level,
    elapsed: 0,
    progress: 0,
    playerX: 0,
    targetX: 0,
    armySize: level.startingArmy,
    score: 0,
    kills: 0,
    gatesClaimed: 0,
    fireCooldown: 0,
    gatePairs: level.gatePairs.map((pair) => ({
      id: pair.id,
      z: pair.z,
      left: { ...pair.left, baseValue: pair.left.value, hits: 0 },
      right: { ...pair.right, baseValue: pair.right.value, hits: 0 },
      resolved: false,
      chosen: null,
    })),
    hordes: level.hordes.map((horde) => ({
      ...horde,
      initialCount: horde.count,
      status: 'active',
      nextPulseAt: Number.POSITIVE_INFINITY,
    })),
    events: [],
    status: 'playing',
  }
}

export function setTargetX(state: GameState, targetX: number): void {
  state.targetX = clamp(targetX, -TRACK_HALF_WIDTH, TRACK_HALF_WIDTH)
}

/**
 * Returns and clears the accumulated simulation events. The renderer calls
 * this once per animation frame after running all fixed steps, so events from
 * every tick in the frame are observed exactly once.
 */
export function drainEvents(state: GameState): GameEvent[] {
  if (state.events.length === 0) {
    return state.events
  }
  const drained = state.events
  state.events = []

  return drained
}

export function tickGame(state: GameState, deltaSeconds: number): void {
  if (state.status !== 'playing' || deltaSeconds <= 0) {
    return
  }

  const delta = Math.min(deltaSeconds, MAX_TICK_DELTA)
  state.elapsed += delta
  state.progress += state.level.forwardSpeed * delta
  state.playerX = approach(state.playerX, state.targetX, delta * STEER_SPEED)

  for (const horde of state.hordes) {
    if (horde.status !== 'active') {
      continue
    }
    horde.z -= horde.speed * delta
    handleBossPulse(state, horde)
  }

  state.fireCooldown -= delta
  while (state.fireCooldown <= 0 && state.status === 'playing') {
    state.fireCooldown += FIRE_INTERVAL
    fireVolley(state)
  }

  resolveGateCrossings(state)
  resolveClashes(state)

  if (state.armySize <= 0) {
    state.armySize = 0
    state.status = 'lost'
  } else if (state.progress >= state.level.length) {
    state.status = 'won'
    state.score += state.armySize * 10
  }
}

export function gateSideValue(side: RuntimeGateSide): number {
  const rule = UPGRADE_RULES[side.op]
  const steps = Math.min(Math.floor(side.hits / rule.shotsPerStep), rule.maxSteps(side.baseValue))

  return rule.valueAt(side.baseValue, steps)
}

export function isFullyUpgraded(side: RuntimeGateSide): boolean {
  const rule = UPGRADE_RULES[side.op]

  return Math.floor(side.hits / rule.shotsPerStep) >= rule.maxSteps(side.baseValue)
}

export function applyGateOp(armySize: number, side: Pick<RuntimeGateSide, 'op' | 'value'>): number {
  switch (side.op) {
    case 'add':
      return Math.min(MAX_ARMY_SIZE, armySize + side.value)
    case 'sub':
      return Math.max(0, armySize - side.value)
    case 'mul':
      return Math.min(MAX_ARMY_SIZE, armySize * side.value)
    case 'div':
      return Math.max(1, Math.floor(armySize / side.value))
  }
}

interface GateTarget {
  kind: 'gate'
  pair: RuntimeGatePair
  sideId: GateSideId
  side: RuntimeGateSide
  x: number
  z: number
}

interface HordeTarget {
  kind: 'horde'
  horde: RuntimeHorde
  x: number
  z: number
}

type FireTarget = GateTarget | HordeTarget

function fireVolley(state: GameState): void {
  const target = findTarget(state)
  if (!target) {
    return
  }

  const shots = clamp(Math.ceil(state.armySize * SHOTS_PER_SOLDIER), 1, MAX_VOLLEY_SHOTS)
  emit(state, { type: 'volley', shots, targetX: target.x, targetZ: target.z, targetKind: target.kind })

  if (target.kind === 'horde') {
    const killed = Math.min(shots, target.horde.count)
    target.horde.count -= killed
    state.kills += killed
    state.score += killed * 10
    emit(state, { type: 'kills', x: target.x, z: target.z, count: killed })
    if (target.horde.count <= 0) {
      target.horde.status = 'destroyed'
      if (target.horde.boss) {
        state.score += 1_000
      }
    }

    return
  }

  const before = gateSideValue(target.side)
  target.side.hits += shots
  const after = gateSideValue(target.side)
  target.side.value = after
  if (after !== before) {
    emit(state, { type: 'gateUpgraded', pairId: target.pair.id, side: target.sideId, value: after })
  }
}

function findTarget(state: GameState): FireTarget | null {
  let best: FireTarget | null = null

  for (const horde of state.hordes) {
    if (horde.status !== 'active' || !isAimCandidate(state, horde.x, horde.z)) {
      continue
    }
    if (!best || horde.z < best.z) {
      best = { kind: 'horde', horde, x: horde.x, z: horde.z }
    }
  }

  for (const pair of state.gatePairs) {
    if (pair.resolved) {
      continue
    }
    for (const sideId of ['left', 'right'] as const) {
      const side = pair[sideId]
      if (isFullyUpgraded(side)) {
        continue
      }
      const x = sideId === 'left' ? -GATE_SIDE_X : GATE_SIDE_X
      if (!isAimCandidate(state, x, pair.z)) {
        continue
      }
      if (!best || pair.z < best.z) {
        best = { kind: 'gate', pair, sideId, side, x, z: pair.z }
      } else if (pair.z === best.z && best.kind === 'gate' && best.pair === pair) {
        const bestDistance = Math.abs(best.x - state.playerX)
        const distance = Math.abs(x - state.playerX)
        if (distance < bestDistance) {
          best = { kind: 'gate', pair, sideId, side, x, z: pair.z }
        }
      }
    }
  }

  return best
}

function isAimCandidate(state: GameState, x: number, z: number): boolean {
  const distance = z - state.progress

  return distance > 0 && distance <= FIRE_RANGE && Math.abs(x - state.playerX) <= AIM_HALF_WIDTH
}

function resolveGateCrossings(state: GameState): void {
  for (const pair of state.gatePairs) {
    if (pair.resolved || state.progress + PLAYER_NOSE < pair.z) {
      continue
    }
    pair.resolved = true
    const sideId: GateSideId = state.playerX > 0 ? 'right' : 'left'
    pair.chosen = sideId
    const side = pair[sideId]
    side.value = gateSideValue(side)
    const before = state.armySize
    state.armySize = applyGateOp(state.armySize, side)
    const delta = state.armySize - before
    state.gatesClaimed += 1
    state.score += 25 + Math.max(0, delta) * 2
    emit(state, { type: 'gateApplied', pairId: pair.id, side: sideId, op: side.op, value: side.value, delta })
  }
}

function resolveClashes(state: GameState): void {
  for (const horde of state.hordes) {
    if (horde.status !== 'active') {
      continue
    }
    const distance = horde.z - state.progress
    if (distance > CLASH_DISTANCE) {
      continue
    }
    if (distance < -ESCAPE_BEHIND) {
      horde.status = 'escaped'
      continue
    }
    if (state.armySize <= 0) {
      return
    }

    const hordeHalfWidth = horde.boss
      ? TRACK_HALF_WIDTH
      : 0.5 + Math.min(1.6, Math.sqrt(Math.min(horde.count, 60)) * 0.16)
    const overlaps = distance >= -CLASH_DISTANCE
      && Math.abs(horde.x - state.playerX) <= hordeHalfWidth + squadHalfWidth(state.armySize)

    if (overlaps) {
      if (state.armySize > horde.count) {
        const killed = horde.count
        state.armySize -= killed
        state.kills += killed
        state.score += killed * 5
        horde.count = 0
        horde.status = 'destroyed'
        if (horde.boss) {
          state.score += 1_000
        }
        emit(state, { type: 'clash', x: horde.x, lostSoldiers: killed, killed, survived: true })
      } else {
        const lost = state.armySize
        horde.count -= lost
        state.armySize = 0
        if (horde.count <= 0) {
          horde.status = 'destroyed'
        }
        emit(state, { type: 'clash', x: horde.x, lostSoldiers: lost, killed: lost, survived: false })
      }
    }
  }
}

function handleBossPulse(state: GameState, horde: RuntimeHorde): void {
  if (!horde.boss || horde.pulseInterval === undefined || horde.z - state.progress > BOSS_PULSE_RANGE) {
    return
  }
  if (!Number.isFinite(horde.nextPulseAt)) {
    horde.nextPulseAt = state.elapsed + horde.pulseInterval
  }
  if (state.elapsed >= horde.nextPulseAt) {
    const lost = Math.min(state.armySize, horde.pulseDamage ?? 1)
    state.armySize -= lost
    horde.nextPulseAt += horde.pulseInterval
    emit(state, { type: 'bossPulse', lost })
  }
}

export function squadHalfWidth(armySize: number): number {
  return 0.45 + Math.min(1.4, Math.sqrt(Math.max(0, armySize)) * 0.09)
}

export function computeStars(state: GameState): 1 | 2 | 3 {
  const [twoStars, threeStars] = state.level.starArmyThresholds
  if (state.armySize >= threeStars) {
    return 3
  }
  if (state.armySize >= twoStars) {
    return 2
  }

  return 1
}

export function buildHudSnapshot(state: GameState): HudSnapshot {
  const boss = state.hordes.find((horde) => horde.boss && horde.status === 'active' && horde.z - state.progress <= BOSS_HUD_RANGE)

  return {
    armySize: state.armySize,
    bossCount: boss ? boss.count : null,
    bossInitialCount: boss ? boss.initialCount : null,
    progress: Math.min(1, state.progress / state.level.length),
    score: state.score,
  }
}

function emit(state: GameState, event: GameEvent): void {
  if (state.events.length < MAX_EVENTS_PER_TICK) {
    state.events.push(event)
  }
}

function approach(value: number, target: number, amount: number): number {
  if (value < target) {
    return Math.min(target, value + amount)
  }

  return Math.max(target, value - amount)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
