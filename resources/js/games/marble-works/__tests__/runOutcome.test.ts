import { GOAL_SETTLE_S, STUCK_S } from '../physics/constants'
import { createMarbleTracker, isOutOfBounds, judgeRun, type MarbleSample, type MarbleStatus, updateMarbleTracker } from '../physics/runOutcome'

const BOARD = { cols: 6, rows: 6 }
const STEP = 1 / 240
const ROLLING: MarbleSample = { x: 3, y: 3, speed: 2, basket: -1, refusal: null }

function rollFor(seconds: number, sample: MarbleSample): MarbleStatus {
  const tracker = createMarbleTracker()
  tracker.status = 'rolling'
  let status: MarbleStatus = tracker.status
  for (let t = 0; t < seconds && status === 'rolling'; t += STEP) {
    status = updateMarbleTracker(tracker, BOARD, sample, STEP)
  }

  return status
}

describe('run outcome judge', () => {
  it('brings a marble home once it has settled in an accepting basket', () => {
    const inBasket = { ...ROLLING, speed: 0, basket: 0 }

    expect(rollFor(GOAL_SETTLE_S - 0.05, inBasket)).toBe('rolling')
    expect(rollFor(GOAL_SETTLE_S + 0.05, inBasket)).toBe('home')
  })

  it('fails a marble that settles in a basket that refuses it', () => {
    expect(rollFor(GOAL_SETTLE_S + 0.05, { ...ROLLING, speed: 0, basket: 1, refusal: 'wrong' })).toBe('wrong')
    expect(rollFor(GOAL_SETTLE_S + 0.05, { ...ROLLING, speed: 0, basket: 1, refusal: 'full' })).toBe('full')
  })

  it('loses a marble that leaves the board', () => {
    expect(isOutOfBounds(BOARD, 3, -1.5)).toBe(true)
    expect(isOutOfBounds(BOARD, -1.5, 3)).toBe(true)
    expect(isOutOfBounds(BOARD, 7.5, 3)).toBe(true)
    expect(isOutOfBounds(BOARD, 3, 9)).toBe(false)
    expect(rollFor(0.1, { ...ROLLING, y: -2 })).toBe('out')
  })

  it('calls a marble stuck when it stops outside a basket', () => {
    expect(rollFor(STUCK_S + 0.1, { ...ROLLING, speed: 0 })).toBe('stuck')
    expect(rollFor(STUCK_S + 0.1, ROLLING)).toBe('rolling')
  })

  it('never changes a finished marble', () => {
    const tracker = createMarbleTracker()
    tracker.status = 'out'

    expect(updateMarbleTracker(tracker, BOARD, { ...ROLLING, basket: 0, speed: 0 }, 1)).toBe('out')
  })

  it('wins only when every marble is home, and fails on the first failed marble', () => {
    expect(judgeRun(['home', 'home'], 3, 25)).toBe('won')
    expect(judgeRun(['home', 'rolling'], 3, 25)).toBe('running')
    expect(judgeRun(['home', 'waiting'], 3, 25)).toBe('running')
    expect(judgeRun(['rolling', 'wrong'], 3, 25)).toBe('wrong')
    expect(judgeRun(['out', 'stuck'], 3, 25)).toBe('out')
    expect(judgeRun(['home', 'rolling'], 25, 25)).toBe('timeout')
    expect(judgeRun([], 1, 25)).toBe('running')
  })
})
