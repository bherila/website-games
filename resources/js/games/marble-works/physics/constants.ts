/** Marble Works physics tuning. One world unit = one grid cell; +y is up. */
export const GRAVITY_Y = -9.8
/** Fixed physics step. Small enough that a marble at MAX_SPEED moves < 0.04 cells per step. */
export const FIXED_STEP_S = 1 / 240
/** Rendered frames never run more than this many fixed steps (a stalled tab slows, never jumps). */
export const MAX_STEPS_PER_FRAME = 16
export const MARBLE_RADIUS = 0.2
export const MARBLE_MASS = 1
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
export const RUN_TIMEOUT_S = 25
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
} as const
