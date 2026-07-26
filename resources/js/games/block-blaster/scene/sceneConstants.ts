export const PHYSICS_TIMESTEP = 1 / 60
export const PHYSICS_MAX_SUBSTEPS = 3
export const GRAVITY_Y = -18

export const BALL_RADIUS = 0.35
export const BALL_MASS = 8
export const BALL_SPEED = 22
export const BALL_MAX_AGE_S = 6
export const BALL_KILL_Y = -5
export const FIRE_COOLDOWN_S = 0.25

/** A block is cleared once its center drops this far below its platform's top surface. */
export const CLEAR_DROP = 1.2

export const SETTLE_LINEAR_SPEED = 0.08
export const SETTLE_ANGULAR_SPEED = 0.1
export const SETTLE_QUIET_S = 0.75
export const SETTLE_TIMEOUT_S = 6

export const FRICTION_BLOCK_PLATFORM = 0.6
export const FRICTION_BALL_BLOCK = 0.3
export const FRICTION_BLOCK_BLOCK = 0.4
export const FRICTION_GROUND = 0.5
export const RESTITUTION_BLOCK_PLATFORM = 0.1
export const RESTITUTION_BALL_BLOCK = 0.25

export const PLATFORM_SLAB_THICKNESS = 0.4

export const CANNON_MUZZLE_POSITION: [number, number, number] = [0, 1.4, 7]
/** Height of the cannon's yaw/pitch pivot above the ground (the barrel swings around this point). */
export const CANNON_PIVOT_HEIGHT = 0.7
export const CANNON_BARREL_LENGTH = 1.6
export const CAMERA_POSITION: [number, number, number] = [0, 4.5, 10.5]
export const CAMERA_TARGET: [number, number, number] = [0, 2, 0]

// --- Workstream A additions below (engine + scene). Existing values above are unchanged. ---

/** How long a cleared block visibly tumbles + fades before its mesh/body are despawned. */
export const CLEARED_BLOCK_FADE_S = 2.5

/** Camera ease-in dolly when a level starts. */
export const CAMERA_DOLLY_DURATION_S = 0.5
/** Extra offset (added to CAMERA_POSITION) the camera dollies in from at level start. */
export const CAMERA_DOLLY_START_OFFSET: [number, number, number] = [0, 1.6, 3.4]
export const CAMERA_FOV_DEGREES = 50
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 60

/** Reticle ring radius (world units) rendered at the aim point. */
export const RETICLE_RADIUS = 0.22

/** Muzzle-flash puff + ball/block hit puff durations. */
export const MUZZLE_PUFF_DURATION_S = 0.3
export const HIT_PUFF_DURATION_S = 0.35

/** Cannon recoil-on-fire animation duration. */
export const CANNON_RECOIL_DURATION_S = 0.22
export const CANNON_RECOIL_DEPTH = 0.35

/** Confetti burst duration on win. */
export const CONFETTI_DURATION_S = 1.1

/** Fixed dot count for the preallocated wordless-hint ghost trajectory arc. */
export const GHOST_ARC_POINT_COUNT = 14

/** Shadow map resolution cap (spec: low-res, only over the platform area). */
export const SHADOW_MAP_SIZE = 1024
