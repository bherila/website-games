import { GOAL_SETTLE_S, OUT_OF_BOUNDS_MARGIN, RUN_TIMEOUT_S, STUCK_S, STUCK_SPEED } from './constants'

export type RunStatus = 'running' | 'won' | 'out' | 'stuck' | 'timeout'

export interface RunTracker {
  elapsed: number
  inGoalFor: number
  stillFor: number
  status: RunStatus
}

export interface MarbleSample {
  x: number
  y: number
  speed: number
  inGoal: boolean
}

export function createRunTracker(): RunTracker {
  return { elapsed: 0, inGoalFor: 0, stillFor: 0, status: 'running' }
}

export function isOutOfBounds(board: { cols: number; rows: number }, x: number, y: number): boolean {
  return x < -OUT_OF_BOUNDS_MARGIN || x > board.cols + OUT_OF_BOUNDS_MARGIN || y < -OUT_OF_BOUNDS_MARGIN
}

/** Pure per-step run judge. Once a run leaves `running` its status never changes. */
export function updateRunTracker(
  tracker: RunTracker,
  board: { cols: number; rows: number },
  sample: MarbleSample,
  dt: number,
): RunStatus {
  if (tracker.status !== 'running') {
    return tracker.status
  }

  tracker.elapsed += dt
  tracker.inGoalFor = sample.inGoal ? tracker.inGoalFor + dt : 0
  tracker.stillFor = sample.speed < STUCK_SPEED ? tracker.stillFor + dt : 0

  if (tracker.inGoalFor >= GOAL_SETTLE_S) {
    tracker.status = 'won'
  } else if (isOutOfBounds(board, sample.x, sample.y)) {
    tracker.status = 'out'
  } else if (!sample.inGoal && tracker.stillFor >= STUCK_S) {
    tracker.status = 'stuck'
  } else if (tracker.elapsed >= RUN_TIMEOUT_S) {
    tracker.status = 'timeout'
  }

  return tracker.status
}
