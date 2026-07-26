export const MATH_HORDE_PROGRESS_STORAGE_KEY = 'bwh.math-horde.progress.v1'
export const TOTAL_LEVELS = 12
export const MAX_ARMY_SIZE = 400

export type GamePhase = 'select' | 'playing' | 'paused' | 'won' | 'lost'
export type GateOp = 'add' | 'sub' | 'mul' | 'div'
export type GateSideId = 'left' | 'right'

export interface GateSideDef {
  op: GateOp
  value: number
}

export interface GatePairDef {
  id: string
  z: number
  left: GateSideDef
  right: GateSideDef
}

export interface HordeDef {
  id: string
  x: number
  z: number
  count: number
  speed: number
  boss?: boolean
  pulseInterval?: number
  pulseDamage?: number
}

export interface LevelDef {
  id: number
  name: string
  length: number
  forwardSpeed: number
  startingArmy: number
  gatePairs: readonly GatePairDef[]
  hordes: readonly HordeDef[]
  starArmyThresholds: readonly [number, number]
}

export interface RuntimeGateSide extends GateSideDef {
  baseValue: number
  hits: number
}

export interface RuntimeGatePair {
  id: string
  z: number
  left: RuntimeGateSide
  right: RuntimeGateSide
  resolved: boolean
  chosen: GateSideId | null
}

export type HordeStatus = 'active' | 'destroyed' | 'escaped'

export interface RuntimeHorde extends HordeDef {
  initialCount: number
  status: HordeStatus
  nextPulseAt: number
}

export type GameEvent =
  | { type: 'volley'; shots: number; targetX: number; targetZ: number; targetKind: 'gate' | 'horde' }
  | { type: 'kills'; x: number; z: number; count: number }
  | { type: 'gateUpgraded'; pairId: string; side: GateSideId; value: number }
  | { type: 'gateApplied'; pairId: string; side: GateSideId; op: GateOp; value: number; delta: number }
  | { type: 'clash'; x: number; lostSoldiers: number; killed: number; survived: boolean }
  | { type: 'bossPulse'; lost: number }

export interface GameState {
  level: LevelDef
  elapsed: number
  progress: number
  playerX: number
  targetX: number
  armySize: number
  score: number
  kills: number
  gatesClaimed: number
  fireCooldown: number
  gatePairs: RuntimeGatePair[]
  hordes: RuntimeHorde[]
  events: GameEvent[]
  status: 'playing' | 'won' | 'lost'
}

export interface HudSnapshot {
  armySize: number
  bossCount: number | null
  bossInitialCount: number | null
  progress: number
  score: number
}

export interface SavedLevelResult {
  stars: number
  score: number
  survivors: number
}

export interface SavedProgress {
  version: 1
  unlockedLevel: number
  highScore: number
  stars: Record<number, number>
  results: Record<number, SavedLevelResult>
}
