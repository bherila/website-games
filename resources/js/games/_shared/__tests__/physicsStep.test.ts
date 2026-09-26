import type * as CANNON from 'cannon-es'

import { advanceFixedSteps, createFixedStepClock, stepWorldClamped } from '../three/physicsStep'

describe('shared physics stepping', () => {
  it('clamps a long frame to the substep budget', () => {
    const world = { step: jest.fn() } as unknown as CANNON.World

    stepWorldClamped(world, 5, { fixedStep: 1 / 60, maxSubsteps: 3 })

    expect(world.step).toHaveBeenCalledWith(1 / 60, 3 / 60, 3)
  })

  it('runs one tick per whole fixed step and carries the remainder', () => {
    const clock = createFixedStepClock()
    const tick = jest.fn()
    const options = { fixedStep: 0.01, maxSubsteps: 100 }

    expect(advanceFixedSteps(clock, 0.035, options, tick)).toBe(3)
    expect(advanceFixedSteps(clock, 0.006, options, tick)).toBe(1)
    expect(tick).toHaveBeenCalledTimes(4)
  })

  it('never runs more than the substep budget in one frame', () => {
    const clock = createFixedStepClock()

    expect(advanceFixedSteps(clock, 10, { fixedStep: 0.01, maxSubsteps: 5 }, () => undefined)).toBe(5)
  })

  it('stops early when a tick returns false', () => {
    const clock = createFixedStepClock()
    let calls = 0

    expect(advanceFixedSteps(clock, 0.1, { fixedStep: 0.01, maxSubsteps: 100 }, () => {
      calls += 1
      return calls < 2
    })).toBe(2)
    expect(clock.accumulator).toBe(0)
  })
})
