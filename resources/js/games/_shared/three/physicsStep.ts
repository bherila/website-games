import type * as CANNON from 'cannon-es'

export interface FixedStepOptions {
  /** Fixed physics step in seconds (e.g. 1 / 60). */
  fixedStep: number
  /** Most fixed steps one rendered frame may run; also caps the frame delta. */
  maxSubsteps: number
}

/**
 * Advances a cannon-es world by one rendered frame using cannon's internal
 * accumulator. The frame delta is clamped to `fixedStep * maxSubsteps` so a
 * backgrounded tab or a long GC pause can never feed a multi-second step.
 */
export function stepWorldClamped(world: CANNON.World, frameDelta: number, options: FixedStepOptions): void {
  const clamped = Math.min(Math.max(0, frameDelta), options.fixedStep * options.maxSubsteps)
  world.step(options.fixedStep, clamped, options.maxSubsteps)
}

export interface FixedStepClock {
  accumulator: number
}

export function createFixedStepClock(): FixedStepClock {
  return { accumulator: 0 }
}

/**
 * Deterministic fixed-step driver for simulations that run game logic between
 * physics steps (triggers, impulses). `tick` is called once per fixed step, so
 * the sequence of states is identical whatever the frame rate — a headless
 * test that calls `tick` N times reproduces a rendered run exactly. Returns
 * the number of ticks run; stops early when `tick` returns `false`.
 */
export function advanceFixedSteps(
  clock: FixedStepClock,
  frameDelta: number,
  options: FixedStepOptions,
  tick: () => boolean | void,
): number {
  // A hair of slack so float drift (0.05 - 4 × 0.01 = 0.00999…) never drops a step.
  const epsilon = options.fixedStep * 1e-6
  clock.accumulator += Math.max(0, frameDelta)
  let ticks = 0
  while (clock.accumulator + epsilon >= options.fixedStep && ticks < options.maxSubsteps) {
    clock.accumulator -= options.fixedStep
    ticks += 1
    if (tick() === false) {
      clock.accumulator = 0
      return ticks
    }
  }
  // Drop any backlog past the budget: a stalled tab slows the simulation, never fast-forwards it.
  clock.accumulator = Math.max(0, Math.min(clock.accumulator, options.fixedStep))

  return ticks
}
