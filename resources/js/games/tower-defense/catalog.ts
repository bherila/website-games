import type { ElementId, EnemyKind, HeroUpgrade, TowerId } from './gameTypes'

export interface ElementDef {
  id: ElementId
  name: string
  symbol: string
  color: number
  /** The element it deals bonus damage to. */
  strongAgainst: ElementId
  tower: TowerId
}

// The strength cycle: each element beats the next and loses to the previous.
export const ELEMENTS: Record<ElementId, ElementDef> = {
  fire: { id: 'fire', name: 'Fire', symbol: '🔥', color: 0xf97316, strongAgainst: 'nature', tower: 'ember' },
  nature: { id: 'nature', name: 'Nature', symbol: '🌿', color: 0x22c55e, strongAgainst: 'earth', tower: 'thorn' },
  earth: { id: 'earth', name: 'Earth', symbol: '🪨', color: 0xa16207, strongAgainst: 'light', tower: 'boulder' },
  light: { id: 'light', name: 'Light', symbol: '☀️', color: 0xfacc15, strongAgainst: 'dark', tower: 'sun' },
  dark: { id: 'dark', name: 'Dark', symbol: '🌑', color: 0x8b5cf6, strongAgainst: 'water', tower: 'hex' },
  water: { id: 'water', name: 'Water', symbol: '💧', color: 0x38bdf8, strongAgainst: 'fire', tower: 'frost' },
}

export const ELEMENT_IDS: readonly ElementId[] = ['fire', 'water', 'nature', 'earth', 'light', 'dark']

export const STRONG_MULTIPLIER = 1.6
export const WEAK_MULTIPLIER = 0.6

/** Damage multiplier of an attacking element against a defender's element. */
export function elementMultiplier(attacker: ElementId | null, defender: ElementId | null): number {
  if (!attacker || !defender) {
    return 1
  }
  if (ELEMENTS[attacker].strongAgainst === defender) {
    return STRONG_MULTIPLIER
  }

  return ELEMENTS[defender].strongAgainst === attacker ? WEAK_MULTIPLIER : 1
}

export function elementWeakTo(element: ElementId): ElementId {
  return ELEMENT_IDS.find((id) => ELEMENTS[id].strongAgainst === element) ?? element
}

export interface TowerDef {
  id: TowerId
  name: string
  symbol: string
  element: ElementId | null
  /** One line for the build and upgrade panels. */
  blurb: string
  /** Prices of tier 1, 2 and 3. */
  costs: readonly [number, number, number]
  hp: number
  buildSeconds: number
  range: number
  damage: number
  cooldown: number
  /** Blast radius in cells; 0 hits only the target. */
  splash: number
  hitsAir: boolean
  /** Cells per second; 0 fires an instant beam. */
  projectileSpeed: number
  slow?: { factor: number; seconds: number }
  burn?: { dps: number; seconds: number }
  poison?: { dps: number; seconds: number; maxStacks: number }
  /** A beam jumps to this many enemies in total. */
  chain?: number
  /** Extra damage as a fraction of the target's current health. */
  currentHpDamage?: number
  /** Aims at the toughest enemy in range instead of the one closest to the exit. */
  targetsToughest?: boolean
}

export const TOWERS: Record<TowerId, TowerDef> = {
  wall: {
    id: 'wall', name: 'Wall', symbol: '🧱', element: null, blurb: 'Cheap blocker. Bends the path, soaks up attacks.',
    costs: [4, 10, 24], hp: 90, buildSeconds: 0.3, range: 0, damage: 0, cooldown: 0, splash: 0, hitsAir: false, projectileSpeed: 0,
  },
  arrow: {
    id: 'arrow', name: 'Arrow Tower', symbol: '🏹', element: null, blurb: 'Quick single shots. Hits ground and air.',
    costs: [30, 36, 80], hp: 70, buildSeconds: 0.9, range: 3.5, damage: 10, cooldown: 0.7, splash: 0, hitsAir: true, projectileSpeed: 11,
  },
  ember: {
    id: 'ember', name: 'Ember Tower', symbol: '🔥', element: 'fire', blurb: 'Fireballs that splash and set enemies alight.',
    costs: [50, 60, 130], hp: 70, buildSeconds: 1, range: 3.2, damage: 13, cooldown: 1.05, splash: 0.9, hitsAir: true, projectileSpeed: 8,
    burn: { dps: 6, seconds: 2 },
  },
  frost: {
    id: 'frost', name: 'Frost Tower', symbol: '💧', element: 'water', blurb: 'Chills a small area, slowing everything in it.',
    costs: [45, 54, 120], hp: 70, buildSeconds: 1, range: 3.2, damage: 7, cooldown: 1, splash: 1, hitsAir: true, projectileSpeed: 8,
    slow: { factor: 0.55, seconds: 1.6 },
  },
  thorn: {
    id: 'thorn', name: 'Thorn Tower', symbol: '🌿', element: 'nature', blurb: 'Poison stacks with every hit. Long reach.',
    costs: [50, 60, 130], hp: 70, buildSeconds: 1, range: 3.9, damage: 5, cooldown: 0.65, splash: 0, hitsAir: true, projectileSpeed: 10,
    poison: { dps: 3.2, seconds: 3, maxStacks: 6 },
  },
  boulder: {
    id: 'boulder', name: 'Boulder Tower', symbol: '🪨', element: 'earth', blurb: 'Heavy, slow, huge splash. Ground only. Tough.',
    costs: [65, 78, 170], hp: 150, buildSeconds: 1.2, range: 3.1, damage: 34, cooldown: 1.9, splash: 1.25, hitsAir: false, projectileSpeed: 7,
  },
  sun: {
    id: 'sun', name: 'Sun Spire', symbol: '☀️', element: 'light', blurb: 'An instant beam that leaps between enemies.',
    costs: [70, 84, 180], hp: 70, buildSeconds: 1.2, range: 4.4, damage: 15, cooldown: 0.95, splash: 0, hitsAir: true, projectileSpeed: 0,
    chain: 3,
  },
  hex: {
    id: 'hex', name: 'Hex Obelisk', symbol: '🌑', element: 'dark', blurb: 'Hunts the toughest enemy and tears away its health.',
    costs: [80, 96, 210], hp: 70, buildSeconds: 1.2, range: 3.6, damage: 34, cooldown: 1.7, splash: 0, hitsAir: true, projectileSpeed: 12,
    currentHpDamage: 0.05, targetsToughest: true,
  },
}

export const TOWER_IDS: readonly TowerId[] = ['wall', 'arrow', 'ember', 'frost', 'thorn', 'boulder', 'sun', 'hex']
export const MAX_TIER = 3
export const SELL_REFUND = 0.7

const DAMAGE_BY_TIER = [1, 2, 4] as const
const RANGE_BY_TIER = [0, 0.4, 0.8] as const
const HP_BY_TIER = [1, 2.2, 5] as const

export interface TowerStats {
  range: number
  damage: number
  hp: number
  /** Tier scale, shared with damage-over-time effects. */
  scale: number
}

export function towerStats(tower: TowerId, tier: number): TowerStats {
  const def = TOWERS[tower]
  const index = Math.max(0, Math.min(MAX_TIER - 1, tier - 1))
  const scale = DAMAGE_BY_TIER[index] ?? 1

  return {
    range: def.range > 0 ? def.range + (RANGE_BY_TIER[index] ?? 0) : 0,
    damage: def.damage * scale,
    hp: Math.round(def.hp * (HP_BY_TIER[index] ?? 1)),
    scale,
  }
}

export function upgradeCost(tower: TowerId, tier: number): number | null {
  return tier >= MAX_TIER ? null : TOWERS[tower].costs[tier] ?? null
}

export interface EnemyDef {
  kind: EnemyKind
  name: string
  hp: number
  speed: number
  armor: number
  /** Damage per second against a building in its way. */
  attack: number
  /** Gold dropped at wave 1. */
  coins: number
  /** Lives lost if it reaches the keep. */
  lives: number
  flying: boolean
  /** Takes the cheapest route even through buildings, so a long maze will not hold it. */
  breaker: boolean
  /** Seconds between arrivals. */
  interval: number
  size: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { kind: 'grunt', name: 'Grunts', hp: 38, speed: 1.1, armor: 0, attack: 8, coins: 5, lives: 1, flying: false, breaker: false, interval: 1, size: 0.3 },
  swift: { kind: 'swift', name: 'Runners', hp: 22, speed: 1.9, armor: 0, attack: 5, coins: 4, lives: 1, flying: false, breaker: false, interval: 0.7, size: 0.24 },
  brute: { kind: 'brute', name: 'Brutes', hp: 130, speed: 0.8, armor: 3, attack: 22, coins: 12, lives: 2, flying: false, breaker: false, interval: 1.8, size: 0.42 },
  swarm: { kind: 'swarm', name: 'Swarmlings', hp: 12, speed: 1.5, armor: 0, attack: 3, coins: 2, lives: 1, flying: false, breaker: false, interval: 0.3, size: 0.18 },
  flyer: { kind: 'flyer', name: 'Flyers', hp: 30, speed: 1.3, armor: 0, attack: 0, coins: 5, lives: 1, flying: true, breaker: false, interval: 1, size: 0.28 },
  sapper: { kind: 'sapper', name: 'Sappers', hp: 50, speed: 1.05, armor: 1, attack: 34, coins: 7, lives: 1, flying: false, breaker: true, interval: 1.2, size: 0.32 },
  boss: { kind: 'boss', name: 'Warlord', hp: 420, speed: 0.62, armor: 4, attack: 55, coins: 50, lives: 5, flying: false, breaker: false, interval: 3, size: 0.62 },
}

export interface HeroUpgradeDef {
  id: HeroUpgrade
  name: string
  symbol: string
  blurb: string
  costs: readonly number[]
}

export const HERO_UPGRADES: Record<HeroUpgrade, HeroUpgradeDef> = {
  boots: { id: 'boots', name: 'Swift Boots', symbol: '🥾', blurb: 'The hero runs faster.', costs: [40, 90, 180] },
  magnet: { id: 'magnet', name: 'Coin Magnet', symbol: '🧲', blurb: 'Coins fly to the hero from further away.', costs: [30, 70, 150] },
}

export const HERO_BASE_SPEED = 4.2
export const HERO_SPEED_PER_LEVEL = 0.9
export const HERO_BASE_MAGNET = 1.1
export const HERO_MAGNET_PER_LEVEL = 0.8

export function heroSpeed(level: number): number {
  return HERO_BASE_SPEED + (level * HERO_SPEED_PER_LEVEL)
}

export function heroMagnet(level: number): number {
  return HERO_BASE_MAGNET + (level * HERO_MAGNET_PER_LEVEL)
}
