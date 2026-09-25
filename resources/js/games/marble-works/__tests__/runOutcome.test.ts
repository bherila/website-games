import { GOAL_SETTLE_S, RUN_TIMEOUT_S, STUCK_S } from '../physics/constants'
import { createRunTracker, isOutOfBounds, updateRunTracker } from '../physics/runOutcome'

const BOARD = { cols: 6, rows: 6 }
const STEP = 1 / 240

function runFor(seconds: number, sample: Parameters<typeof updateRunTracker>[2]) {
  const tracker = createRunTracker()
  let status = tracker.status
  for (let t = 0; t < seconds && status === 'running'; t += STEP) {
    status = updateRunTracker(tracker, BOARD, sample, STEP)
  }

  return { tracker, status }
}

describe('run outcome judge', () => {
  it('wins once the marble has settled in the basket', () => {
    expect(runFor(GOAL_SETTLE_S - 0.05, { x: 1, y: 1, speed: 0, inGoal: true }).status).toBe('running')
    expect(runFor(GOAL_SETTLE_S + 0.05, { x: 1, y: 1, speed: 0, inGoal: true }).status).toBe('won')
  })

  it('loses when the marble leaves the board', () => {
    expect(isOutOfBounds(BOARD, 3, -1.5)).toBe(true)
    expect(isOutOfBounds(BOARD, -1.5, 3)).toBe(true)
    expect(isOutOfBounds(BOARD, 7.5, 3)).toBe(true)
    expect(isOutOfBounds(BOARD, 3, 9)).toBe(false)
    expect(runFor(0.1, { x: 3, y: -2, speed: 3, inGoal: false }).status).toBe('out')
  })

  it('loses when the marble stops outside the basket', () => {
    expect(runFor(STUCK_S + 0.1, { x: 3, y: 3, speed: 0, inGoal: false }).status).toBe('stuck')
  })

  it('times out a marble that never settles', () => {
    expect(runFor(RUN_TIMEOUT_S + 1, { x: 3, y: 3, speed: 2, inGoal: false }).status).toBe('timeout')
  })

  it('never changes a finished verdict', () => {
    const { tracker } = runFor(1, { x: 3, y: -2, speed: 3, inGoal: false })

    expect(updateRunTracker(tracker, BOARD, { x: 1, y: 1, speed: 0, inGoal: true }, 1)).toBe('out')
  })
})
