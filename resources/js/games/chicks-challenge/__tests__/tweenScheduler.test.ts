import {
  BACKLOG_ACCELERATE_THRESHOLD,
  lerpPosition,
  MAX_SPEED_MULTIPLIER,
  speedMultiplierForBacklog,
  stepDurationMs,
  TweenScheduler,
} from '../scene/tweenScheduler'

describe('speedMultiplierForBacklog', () => {
  it('plays at normal speed while caught up (at or below the threshold)', () => {
    expect(speedMultiplierForBacklog(0)).toBe(1)
    expect(speedMultiplierForBacklog(BACKLOG_ACCELERATE_THRESHOLD)).toBe(1)
  })

  it('accelerates once the backlog exceeds the threshold', () => {
    expect(speedMultiplierForBacklog(BACKLOG_ACCELERATE_THRESHOLD + 1)).toBeGreaterThan(1)
  })

  it('is monotonically non-decreasing in backlog depth', () => {
    let previous = 0
    for (let backlog = 0; backlog <= 20; backlog += 1) {
      const value = speedMultiplierForBacklog(backlog)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('never exceeds MAX_SPEED_MULTIPLIER', () => {
    expect(speedMultiplierForBacklog(1000)).toBe(MAX_SPEED_MULTIPLIER)
  })
})

describe('lerpPosition', () => {
  it('returns the start position at t=0 and the end position at t=1', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 4, y: -2 }
    expect(lerpPosition(a, b, 0)).toEqual(a)
    expect(lerpPosition(a, b, 1)).toEqual(b)
  })

  it('interpolates linearly at t=0.5', () => {
    expect(lerpPosition({ x: 0, y: 0 }, { x: 2, y: 4 }, 0.5)).toEqual({ x: 1, y: 2 })
  })
})

describe('stepDurationMs', () => {
  it('honors an explicit forced flag over occurrence index', () => {
    expect(stepDurationMs(0, 110, 70, true)).toBe(70)
    expect(stepDurationMs(5, 110, 70, false)).toBe(110)
  })

  it('treats the first occurrence in a batch as a normal step and later ones as forced slides', () => {
    expect(stepDurationMs(0, 110, 70)).toBe(110)
    expect(stepDurationMs(1, 110, 70)).toBe(70)
    expect(stepDurationMs(2, 110, 70)).toBe(70)
  })
})

describe('TweenScheduler', () => {
  it('registers an entity and reports its position immediately', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 1, y: 1 })
    expect(scheduler.hasEntity('player')).toBe(true)
    expect(scheduler.positionOf('player')).toEqual({ x: 1, y: 1 })
    expect(scheduler.backlogSteps).toBe(0)
  })

  it('advances a single queued step and converges exactly to the target position', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 0, y: 0 })
    scheduler.enqueue('player', { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, durationMs: 100 })

    scheduler.advance(50)
    const midway = scheduler.positionOf('player')
    expect(midway?.x).toBeCloseTo(0.5)

    scheduler.advance(50)
    expect(scheduler.positionOf('player')).toEqual({ x: 1, y: 0 })
    expect(scheduler.backlogSteps).toBe(0)
  })

  it('chains multiple queued steps for the same entity sequentially, carrying over leftover time', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('bug', { x: 0, y: 0 })
    scheduler.enqueue('bug', { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, durationMs: 50 })
    scheduler.enqueue('bug', { from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, durationMs: 50 })

    // 75ms covers the first step (50ms) plus 25ms into the second.
    scheduler.advance(75)
    const position = scheduler.positionOf('bug')
    expect(position?.x).toBeCloseTo(1.5)
    expect(scheduler.backlogSteps).toBe(1) // the first step completed; the second is still in flight

    scheduler.advance(25)
    expect(scheduler.positionOf('bug')).toEqual({ x: 2, y: 0 })
  })

  it('animates independent entities concurrently', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 0, y: 0 })
    scheduler.setEntity('block:1', { x: 5, y: 5 })
    scheduler.enqueue('player', { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, durationMs: 100 })
    scheduler.enqueue('block:1', { from: { x: 5, y: 5 }, to: { x: 5, y: 6 }, durationMs: 100 })

    scheduler.advance(100)
    expect(scheduler.positionOf('player')).toEqual({ x: 1, y: 0 })
    expect(scheduler.positionOf('block:1')).toEqual({ x: 5, y: 6 })
  })

  it('reports backlog as the longest pending queue and always converges even with a deep backlog', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 0, y: 0 })
    for (let i = 0; i < 5; i += 1) {
      scheduler.enqueue('player', { from: { x: i, y: 0 }, to: { x: i + 1, y: 0 }, durationMs: 100 })
    }
    expect(scheduler.backlogSteps).toBe(5)

    // Advancing far more than the nominal total duration must still land exactly
    // on the final queued target — backlog acceleration must never overshoot.
    scheduler.advance(10_000)
    expect(scheduler.positionOf('player')).toEqual({ x: 5, y: 0 })
    expect(scheduler.backlogSteps).toBe(0)
  })

  it('snapEntity clears any pending queue and jumps immediately', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 0, y: 0 })
    scheduler.enqueue('player', { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, durationMs: 100 })

    scheduler.snapEntity('player', { x: 9, y: 9 })
    expect(scheduler.positionOf('player')).toEqual({ x: 9, y: 9 })
    expect(scheduler.backlogSteps).toBe(0)
  })

  it('removeEntity forgets the entity entirely', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('block:1', { x: 0, y: 0 })
    scheduler.removeEntity('block:1')
    expect(scheduler.hasEntity('block:1')).toBe(false)
    expect(scheduler.positionOf('block:1')).toBeUndefined()
  })

  it('clearAllQueues drops pending steps without moving entities', () => {
    const scheduler = new TweenScheduler<string>()
    scheduler.setEntity('player', { x: 0, y: 0 })
    scheduler.enqueue('player', { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, durationMs: 100 })
    scheduler.clearAllQueues()
    expect(scheduler.backlogSteps).toBe(0)
    expect(scheduler.positionOf('player')).toEqual({ x: 0, y: 0 })
  })
})
