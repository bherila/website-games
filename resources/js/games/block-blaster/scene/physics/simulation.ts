import {
  BALL_KILL_Y,
  BALL_MAX_AGE_S,
  SETTLE_ANGULAR_SPEED,
  SETTLE_LINEAR_SPEED,
  SETTLE_QUIET_S,
  SETTLE_TIMEOUT_S,
} from '../sceneConstants'

const TIME_COMPARISON_EPSILON_S = 1e-9

/** Per-body quiescence check for settle/lose detection. */
export function isBodyQuiet(linearSpeed: number, angularSpeed: number): boolean {
  return linearSpeed < SETTLE_LINEAR_SPEED && angularSpeed < SETTLE_ANGULAR_SPEED
}

export interface CarrierRelativeInput {
  positionX: number
  positionZ: number
  velocityX: number
  velocityY: number
  velocityZ: number
  angularVelocityX: number
  angularVelocityY: number
  angularVelocityZ: number
  /** The carrying platform's driver angular velocity around Y (rad/s) and rotation axis. */
  carrierAngularVelocityY: number
  carrierCenterX: number
  carrierCenterZ: number
}

export interface RelativeSpeeds {
  linearSpeed: number
  angularSpeed: number
}

/**
 * Speeds of a body measured in its carrying platform's rotating frame. A block riding a spinning
 * platform has world linear velocity ω×r and angular velocity ω even when perfectly settled, so
 * judging quiescence on world speeds would never see rotating levels as settled. The result is
 * written into `out` to keep the per-frame path allocation-free.
 */
export function carrierRelativeSpeeds(input: CarrierRelativeInput, out: RelativeSpeeds): RelativeSpeeds {
  const rx = input.positionX - input.carrierCenterX
  const rz = input.positionZ - input.carrierCenterZ
  const carriedVx = input.carrierAngularVelocityY * rz
  const carriedVz = -input.carrierAngularVelocityY * rx
  const dvx = input.velocityX - carriedVx
  const dvy = input.velocityY
  const dvz = input.velocityZ - carriedVz
  const dax = input.angularVelocityX
  const day = input.angularVelocityY - input.carrierAngularVelocityY
  const daz = input.angularVelocityZ
  out.linearSpeed = Math.sqrt((dvx * dvx) + (dvy * dvy) + (dvz * dvz))
  out.angularSpeed = Math.sqrt((dax * dax) + (day * day) + (daz * daz))
  return out
}

export interface SettleState {
  quietElapsed: number
  waitingElapsed: number
  fired: boolean
}

export function createSettleState(): SettleState {
  return { quietElapsed: 0, waitingElapsed: 0, fired: false }
}

export interface SettleUpdateParams {
  /** Balls left to fire. */
  ballsRemaining: number
  /** Balls currently in flight/on the platform (not yet removed). */
  liveBallCount: number
  /** Blocks not yet cleared. */
  remainingBlockCount: number
  /** Whether every remaining block is currently below the settle speed thresholds. */
  allBlocksQuiet: boolean
  /** A block was newly cleared this frame — restarts the quiescence wait. */
  blockClearedThisFrame: boolean
  dt: number
}

/**
 * Advances the lose-detection settle tracker by one frame. Returns true exactly once, the frame
 * quiescence (or the timeout) is reached with balls exhausted and blocks remaining. A block
 * clearing during the wait cancels/restarts the evaluation, per spec, since a win can still
 * happen; a fresh clear also cannot yield a `remainingBlockCount` of zero and a lose in the same
 * frame because the win check takes priority upstream.
 */
export function updateSettleState(state: SettleState, params: SettleUpdateParams): boolean {
  if (state.fired) {
    return false
  }

  const waitingToLose = params.ballsRemaining <= 0 && params.liveBallCount <= 0 && params.remainingBlockCount > 0
  if (!waitingToLose || params.blockClearedThisFrame) {
    state.quietElapsed = 0
    state.waitingElapsed = 0
    return false
  }

  state.waitingElapsed += params.dt
  state.quietElapsed = params.allBlocksQuiet ? state.quietElapsed + params.dt : 0

  if (
    state.quietElapsed + TIME_COMPARISON_EPSILON_S >= SETTLE_QUIET_S
    || state.waitingElapsed + TIME_COMPARISON_EPSILON_S >= SETTLE_TIMEOUT_S
  ) {
    state.fired = true
    return true
  }

  return false
}

export interface BallLifecycleInput {
  y: number
  isSleeping: boolean
  age: number
}

/** True when a fired ball should be removed: it fell out of the world, slept, or aged out. */
export function shouldRemoveBall(input: BallLifecycleInput): boolean {
  return input.y < BALL_KILL_Y || input.isSleeping || input.age >= BALL_MAX_AGE_S
}

/** Ids present in `current` but not `previous` — drives the newly-cleared fade/despawn + HUD callback. */
export function diffNewClearedIds(previous: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  const added: string[] = []
  for (const id of current) {
    if (!previous.has(id)) {
      added.push(id)
    }
  }

  return added
}
