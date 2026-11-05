import type { FieldRules } from './pathfinding'

export const COLS = 13
export const ROWS = 21
export const TOWER_DEFENSE_PROGRESS_STORAGE_KEY = 'bwh.tower-defense.progress.v1'

export type ElementId = 'fire' | 'water' | 'nature' | 'earth' | 'light' | 'dark'
export type TowerId = 'wall' | 'arrow' | 'ember' | 'frost' | 'thorn' | 'boulder' | 'sun' | 'hex'
export type EnemyKind = 'grunt' | 'swift' | 'brute' | 'swarm' | 'flyer' | 'sapper' | 'boss'
export type ThemeId = 'meadow' | 'dunes' | 'tundra' | 'ember' | 'dusk'
export type Terrain = 'ground' | 'pad' | 'rock' | 'water' | 'spawn' | 'exit'
export type HeroUpgrade = 'boots' | 'magnet'
export type GameStatus = 'playing' | 'won' | 'lost'

export interface CellPosition {
  col: number
  row: number
}

export interface LevelDef {
  id: number
  title: string
  theme: ThemeId
  /** ROWS strings of COLS characters: `.` ground, `,` no-build ground, `#` rock, `~` water, `S` spawn, `E` exit. */
  map: readonly string[]
  waves: number
  startGold: number
  /** Multiplies enemy health. */
  hpScale: number
  /** Multiplies how many enemies each wave sends. */
  countScale: number
  /** The waves after which the player chooses another element; 0 means before the first wave. */
  picksAfter: readonly number[]
  elementOrder: readonly ElementId[]
}

export interface WaveGroup {
  kind: EnemyKind
  count: number
  interval: number
  delay: number
}

export interface WaveDef {
  number: number
  element: ElementId | null
  groups: readonly WaveGroup[]
  hpMultiplier: number
  coinMultiplier: number
  boss: boolean
}

export interface Building {
  id: number
  tower: TowerId
  tier: number
  col: number
  row: number
  hp: number
  maxHp: number
  /** 0..1 while under construction; only a finished building (1) fires. */
  progress: number
  cooldown: number
  /** Gold spent on it so far, which selling refunds part of. */
  invested: number
  /** Seconds since an enemy last struck it; drives the hit flash. */
  hitAge: number
  /** Direction of the last shot, for the view to face. */
  aim: number
}

/** A job waiting for the hero: its gold was paid when it was queued. */
export interface Plan {
  id: number
  type: 'build' | 'upgrade'
  tower: TowerId
  col: number
  row: number
  cost: number
  /** The building it became or upgrades. */
  buildingId: number | null
  /** 0..1 of the hero's work on an upgrade. */
  progress: number
}

export interface Enemy {
  id: number
  kind: EnemyKind
  element: ElementId | null
  x: number
  y: number
  offsetX: number
  offsetY: number
  hp: number
  maxHp: number
  armor: number
  speed: number
  attack: number
  coins: number
  lives: number
  flying: boolean
  breaker: boolean
  slowTimer: number
  slowFactor: number
  burnTimer: number
  burnDps: number
  poisonTimer: number
  poisonStacks: number
  poisonDps: number
  nextCol: number
  nextRow: number
  routedVersion: number
  routedCell: number
  attackingId: number | null
  distanceToExit: number
  heading: number
  /** Monotonic walk clock for the view's bob. */
  walk: number
}

export interface Projectile {
  id: number
  tower: TowerId
  tier: number
  x: number
  y: number
  fromX: number
  fromY: number
  /** Total flight distance, for the view's arc. */
  flight: number
  targetId: number
  targetX: number
  targetY: number
}

export interface Coin {
  id: number
  x: number
  y: number
  value: number
  age: number
  /** Bouncing out of the kill: not collectable until settled. */
  settle: number
}

export interface Hero {
  x: number
  y: number
  heading: number
  moving: boolean
  working: boolean
  moveTarget: { x: number; y: number } | null
  input: { x: number; y: number }
  navField: Float64Array | null
  navKey: string
  speedLevel: number
  magnetLevel: number
  walk: number
}

export type GameEvent =
  | { type: 'fire'; tower: TowerId; x: number; y: number }
  | { type: 'hit'; tower: TowerId; x: number; y: number; splash: number }
  | { type: 'beam'; points: readonly { x: number; y: number }[] }
  | { type: 'death'; kind: EnemyKind; x: number; y: number }
  | { type: 'coin'; x: number; y: number; value: number }
  | { type: 'coinLost'; x: number; y: number }
  | { type: 'buildStart'; x: number; y: number }
  | { type: 'built'; tower: TowerId; x: number; y: number }
  | { type: 'upgraded'; x: number; y: number }
  | { type: 'sold'; x: number; y: number }
  | { type: 'strike'; x: number; y: number }
  | { type: 'destroyed'; tower: TowerId; x: number; y: number }
  | { type: 'leak'; lives: number }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'pathBlocked'; blocked: boolean }

export interface WaveSpawn {
  kind: EnemyKind
  at: number
  spawnIndex: number
}

export interface GameState {
  level: LevelDef
  waves: readonly WaveDef[]
  status: GameStatus
  clock: number
  gold: number
  lives: number
  maxLives: number
  terrain: readonly Terrain[]
  spawns: readonly CellPosition[]
  exits: readonly CellPosition[]
  buildings: Building[]
  buildingAt: (Building | null)[]
  plans: Plan[]
  enemies: Enemy[]
  projectiles: Projectile[]
  coins: Coin[]
  hero: Hero
  events: GameEvent[]
  random: () => number
  nextId: number
  /** Bumped whenever the walkable grid changes. */
  gridVersion: number
  gridDirty: boolean
  /** How each kind of walker reads the grid. */
  rules: { open: FieldRules; breach: FieldRules; hero: FieldRules }
  openField: Float64Array
  breachField: Float64Array
  /** No clear way from a spawn to the exit, so walkers will break through. */
  pathBlocked: boolean
  /** Waves started so far. */
  waveNumber: number
  waveClock: number
  spawnQueue: WaveSpawn[]
  /** Seconds until the next wave; null while a wave is still arriving or none are left. */
  nextWaveIn: number | null
  clearBonusPending: boolean
  unlocked: ElementId[]
  pendingPicks: number
  kills: number
  goldCollected: number
  goldExpired: number
}

export interface HudSnapshot {
  gold: number
  lives: number
  maxLives: number
  waveNumber: number
  totalWaves: number
  nextWaveIn: number | null
  nextWave: WaveDef | null
  enemiesAlive: number
  coinsOnGround: number
  pathBlocked: boolean
  unlocked: readonly ElementId[]
  pendingPicks: number
  heroSpeedLevel: number
  heroMagnetLevel: number
  plans: number
  buildingCount: number
  status: GameStatus
}
