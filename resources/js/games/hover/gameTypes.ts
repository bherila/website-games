import { TOTAL_LEVELS } from './maps/maps'
import type { GridPos, MapDef, MapId } from './maps/mapTypes'

export type { GridPos } from './maps/mapTypes'

/** World-plane vector: the game simulates on XZ (three.js ground plane). */
export interface Vec2 {
  x: number
  z: number
}

export type GamePhase = 'attract' | 'mapIntro' | 'playing' | 'paused' | 'mapComplete' | 'mapLost' | 'gameOver'

export type PodKind = 'speedUp' | 'slowDown' | 'jump'

export type FlagTeam = 'blue' | 'red'

export interface Flag {
  id: number
  team: FlagTeam
  cell: GridPos
  pos: Vec2
  collected: boolean
}

export interface Pod {
  id: number
  kind: PodKind
  cell: GridPos
  pos: Vec2
  active: boolean
  respawnSec: number
}

export interface SpeedEffect {
  kind: 'boost' | 'slow'
  multiplier: number
  remainingSec: number
}

export interface Trap {
  id: number
  cell: GridPos
  pos: Vec2
}

export interface CraftState {
  pos: Vec2
  vel: Vec2
  heading: number
  angularVel: number
  altitude: number
  verticalVel: number
  airborne: boolean
  radius: number
  speedEffect: SpeedEffect | null
  /** Once collected, jumping is unlocked for the rest of the round. */
  hasJumpPower: boolean
  /** While positive the craft is glued to a sticky trap (no control). */
  stuckSec: number
  /** Post-release immunity so a trap can't re-grab before the craft escapes. */
  trapGraceSec: number
  /** Cooldown so an arrow pad fires once per crossing, not every substep. */
  arrowGraceSec: number
}

export interface DroneBrain {
  /** World-space waypoints of the current A* path (cell centers). */
  path: Vec2[]
  waypointIndex: number
  targetFlagId: number | null
  stallTimer: number
  /** Throttles A* so pathing never runs more than ~2×/sec. */
  repathCooldown: number
  /** While positive, the drone reverses thrust to unstick itself. */
  reverseTimer: number
}

export type RoundOutcome = 'playing' | 'won' | 'lost'

export interface EngineState {
  map: MapDef
  cycle: number
  roundIndex: number
  lossesOnMap: number
  player: CraftState
  drone: CraftState
  droneBrain: DroneBrain
  flags: Flag[]
  pods: Pod[]
  traps: Trap[]
  /** Cumulative banked score across the whole run. */
  score: number
  /** Score banked during the current map only (shown in the tally). */
  mapScore: number
  /** Shared decaying value of every uncollected flag (they all spawn together). */
  flagValue: number
  elapsedSec: number
  outcome: RoundOutcome
  prevJumpHeld: boolean
}

export type EngineEventKind =
  | 'flagBlue'
  | 'flagRed'
  | 'pod'
  | 'bounce'
  | 'craftBump'
  | 'jump'
  | 'land'
  | 'trapped'
  | 'arrow'
  | 'win'
  | 'lose'

export interface EngineEvent {
  kind: EngineEventKind
  actor: 'player' | 'drone'
  podKind?: PodKind
  /** Impact strength for bounce/craftBump, used to scale SFX volume (0..1). */
  intensity?: number
}

/** Throttled snapshot pushed into React state for the HUD (~10Hz). */
export interface HudSnapshot {
  score: number
  mapScore: number
  flagValue: number
  blueCollected: number
  blueTotal: number
  redCollected: number
  redTotal: number
  /** Player speed in world units/sec. */
  speed: number
  speedEffect: SpeedEffect | null
  hasJumpPower: boolean
  mapId: MapId
  mapName: string
  cycle: number
  lossesOnMap: number
}

export const HOVER_PROGRESS_STORAGE_KEY = 'bwh.hover-game.progress.v1'
export const HOVER_SETTINGS_STORAGE_KEY = 'bwh.hover-game.settings.v1'

/** Fixed physics timestep (seconds); render loop accumulates real time into these. */
export const DT = 1 / 120
export const MAX_SUBSTEPS = 6

export const CRAFT_RADIUS = 1.1
export const COCKPIT_HEIGHT = 1.5
export const MAX_SPEED = 26
export const THRUST_ACCEL = 30
export const REVERSE_ACCEL = 18
export const DRAG = 0.8
/** Fraction of lateral (sideways) velocity bled per second — low grip = drift. */
export const LATERAL_GRIP = 1.8
export const TURN_RATE = 2.6
export const TURN_SMOOTHING = 10
export const WALL_RESTITUTION = 0.65
export const CRAFT_RESTITUTION = 0.8

export const GRAVITY = 34
export const JUMP_VELOCITY = 13
export const HOVER_ALTITUDE = 0

export const FLAG_START_VALUE = 500
export const FLAG_DECAY_PER_SEC = 4
export const FLAG_MIN_VALUE = 100
export const MAP_BONUS_PER_CYCLE = 1000
export const MAX_LOSSES_PER_MAP = 3

export const FLAG_PICKUP_RADIUS = 1.6
export const POD_PICKUP_RADIUS = 1.5
export const POD_RESPAWN_SEC = 20

export const SPEED_BOOST_MULTIPLIER = 1.5
export const SPEED_BOOST_SEC = 8
export const SLOW_DOWN_MULTIPLIER = 0.55
export const SLOW_DOWN_SEC = 6

export const TRAP_HOLD_SEC = 2
export const TRAP_GRACE_SEC = 1.2
/** Traps are square: a grounded craft within this half-extent gets stuck. */
export const TRAP_HALF_EXTENT = 1.5

export const ARROW_BOOST_SPEED = 32
export const ARROW_GRACE_SEC = 1
export const ARROW_PAD_RADIUS = 1.9

export const DRONE_BASE_SPEED_SCALE = 0.68
export const DRONE_SPEED_SCALE_PER_LEVEL = 0.045
export const DRONE_SPEED_SCALE_PER_CYCLE = 0.06
export const DRONE_MAX_SPEED_SCALE = 1.1

export function flagCountForCycle(cycle: number): number {
  return Math.min(9, 2 + Math.max(1, cycle))
}

export function podCountForCycle(cycle: number): number {
  return Math.min(8, 4 + Math.max(1, cycle) - 1)
}

export function trapCountForCycle(cycle: number): number {
  return Math.min(5, 1 + Math.max(1, cycle))
}

/**
 * Difficulty ramps within a cycle (level 1 is beatable by a first-time
 * player; the temple drone is a real race) and keeps creeping per cycle.
 */
export function droneSpeedScaleForRound(roundIndex: number): number {
  const levelIndex = ((roundIndex % TOTAL_LEVELS) + TOTAL_LEVELS) % TOTAL_LEVELS
  const cycle = cycleForRound(roundIndex)
  return Math.min(
    DRONE_MAX_SPEED_SCALE,
    DRONE_BASE_SPEED_SCALE + levelIndex * DRONE_SPEED_SCALE_PER_LEVEL + (cycle - 1) * DRONE_SPEED_SCALE_PER_CYCLE,
  )
}

export function cycleForRound(roundIndex: number): number {
  return Math.floor(roundIndex / TOTAL_LEVELS) + 1
}

/**
 * Unit forward vector for a heading (radians). Matches three.js: an Object3D
 * with rotation.y = heading faces its local -z, so heading 0 = north (-z,
 * "up" on the minimap) and positive headings turn counterclockwise (left).
 */
export function headingForward(heading: number): Vec2 {
  return { x: -Math.sin(heading), z: -Math.cos(heading) }
}
