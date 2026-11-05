/** Marble Works physics tuning. One world unit = one grid cell; +y is up. */
export const GRAVITY_Y = -9.8
/** Fixed physics step. Small enough that a marble at MAX_SPEED moves < 0.04 cells per step. */
export const FIXED_STEP_S = 1 / 240
/** Rendered frames never run more than this many fixed steps (a stalled tab slows, never jumps). */
export const MAX_STEPS_PER_FRAME = 16
/** Radius of the standard glass marble (other kinds: see `marbles.ts`). */
export const MARBLE_RADIUS = 0.2
/** Speed clamp (cells/s) — keeps the marble from tunnelling through 0.1-thick walls. */
export const MAX_SPEED = 9
export const LINEAR_DAMPING = 0.02
export const ANGULAR_DAMPING = 0.05

/** How long the marble must stay inside the basket to count as a win. */
export const GOAL_SETTLE_S = 0.3
/** Below this speed the marble counts as stopped. */
export const STUCK_SPEED = 0.06
/** Stopped (outside the basket) for this long = stuck. */
export const STUCK_S = 1.5
/** A run times out this long after its last marble is released. */
export const RUN_TIMEOUT_S = 25
/** Default gap between a dropper's releases. */
export const RELEASE_INTERVAL_S = 1.6
/** The dropper gate opens this long after Go before the first marble falls. */
export const FIRST_RELEASE_S = 0.12
/** A marble collects a gem when its centre comes this close to the gem's. */
export const GEM_PICKUP_RADIUS = 0.34
/** How far past the board edge the marble may travel before it is lost. */
export const OUT_OF_BOUNDS_MARGIN = 1

/** Launcher / trampoline re-trigger cool-down. */
export const BEHAVIOR_COOLDOWN_S = 0.25
/** Minimum downward speed that makes a trampoline fire. */
export const TRAMPOLINE_MIN_IMPACT = 0.4

/** Record a path sample every N fixed steps (for the trail and the last-run ghost path). */
export const PATH_SAMPLE_EVERY = 6

export const CONTACT_MATERIALS = {
  track: { friction: 0.2, restitution: 0.1 },
  tube: { friction: 0.12, restitution: 0.05 },
  rubber: { friction: 0.3, restitution: 0.85 },
  spring: { friction: 0.2, restitution: 0.05 },
  obstacle: { friction: 0.25, restitution: 0.1 },
  basket: { friction: 0.6, restitution: 0.02 },
  glass: { friction: 0.15, restitution: 0.15 },
} as const

/** Marble-on-marble contacts: a little clack, not a pool break. */
export const MARBLE_CONTACT = { friction: 0.1, restitution: 0.45 } as const
/** Speed a steel ball keeps after smashing through glass. */
export const SHATTER_KEEP = 0.8
