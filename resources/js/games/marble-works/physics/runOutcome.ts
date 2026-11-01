import { GOAL_SETTLE_S, OUT_OF_BOUNDS_MARGIN, STUCK_S, STUCK_SPEED } from './constants'

/**
 * How a whole run ended. `wrong` = a marble settled in a basket that does not accept its
 * kind; `full` = it settled in a basket that already held all the marbles it takes.
 */
export type RunStatus = 'running' | 'won' | 'out' | 'stuck' | 'timeout' | 'wrong' | 'full'
export type FailStatus = Exclude<RunStatus, 'running' | 'won'>

/** One marble's state: waiting in its dropper, rolling, safely home, or failed. */
export type MarbleStatus = 'waiting' | 'rolling' | 'home' | 'out' | 'stuck' | 'wrong' | 'full'

export interface MarbleTracker {
  status: MarbleStatus
  /** Index of the basket the marble is settling in (or settled in), else -1. */
  basket: number
  inBasketFor: number
  stillFor: number
}

export interface MarbleSample {
  x: number
  y: number
  speed: number
  /** Basket whose interior holds the marble centre, or -1. */
  basket: number
  /** Why that basket would refuse this marble, or null when it accepts it. */
  refusal: 'wrong' | 'full' | null
}

export function createMarbleTracker(): MarbleTracker {
  return { status: 'waiting', basket: -1, inBasketFor: 0, stillFor: 0 }
}

export function isOutOfBounds(board: { cols: number; rows: number }, x: number, y: number): boolean {
  return x < -OUT_OF_BOUNDS_MARGIN || x > board.cols + OUT_OF_BOUNDS_MARGIN || y < -OUT_OF_BOUNDS_MARGIN
}

/** Pure per-step judge for one released marble. Once it leaves `rolling` its status never changes. */
export function updateMarbleTracker(
  tracker: MarbleTracker,
  board: { cols: number; rows: number },
  sample: MarbleSample,
  dt: number,
): MarbleStatus {
  if (tracker.status !== 'rolling') {
    return tracker.status
  }

  if (sample.basket >= 0 && sample.basket === tracker.basket) {
    tracker.inBasketFor += dt
  } else {
    tracker.basket = sample.basket
    tracker.inBasketFor = sample.basket >= 0 ? dt : 0
  }
  tracker.stillFor = sample.speed < STUCK_SPEED ? tracker.stillFor + dt : 0

  if (tracker.basket >= 0 && tracker.inBasketFor >= GOAL_SETTLE_S) {
    tracker.status = sample.refusal ?? 'home'
  } else if (isOutOfBounds(board, sample.x, sample.y)) {
    tracker.status = 'out'
  } else if (tracker.basket < 0 && tracker.stillFor >= STUCK_S) {
    tracker.status = 'stuck'
  }

  return tracker.status
}

/**
 * The run's verdict from every marble: the first failure ends it, all marbles home wins it,
 * and running past `timeoutAt` seconds times it out.
 */
export function judgeRun(statuses: readonly MarbleStatus[], elapsed: number, timeoutAt: number): RunStatus {
  for (const status of statuses) {
    if (status === 'out' || status === 'stuck' || status === 'wrong' || status === 'full') {
      return status
    }
  }
  if (statuses.length > 0 && statuses.every((status) => status === 'home')) {
    return 'won'
  }

  return elapsed >= timeoutAt ? 'timeout' : 'running'
}
