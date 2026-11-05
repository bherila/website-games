import { z } from 'zod'

import { createGameState, createRandom } from './gameEngine'
import { COLS, type GameState, ROWS } from './gameTypes'
import { levelById } from './levels'

/** Bump when simulation/catalog changes make continuing an older run unsafe. */
export const RUN_VERSION = 1
export const MAX_RUN_BYTES = 250_000
const number = z.number().finite()
const positive = number.nonnegative()
const integer = positive.int().max(Number.MAX_SAFE_INTEGER)
const id = integer.min(1)
const col = integer.max(COLS - 1)
const row = integer.max(ROWS - 1)
const x = number.min(-1).max(COLS + 1)
const y = number.min(-1).max(ROWS + 1)
const point = z.object({ x, y })
const tower = z.enum(['wall', 'arrow', 'ember', 'frost', 'thorn', 'boulder', 'sun', 'hex'])
const element = z.enum(['fire', 'water', 'nature', 'earth', 'light', 'dark'])
const kind = z.enum(['grunt', 'swift', 'brute', 'swarm', 'flyer', 'sapper', 'boss'])
const fraction = number.min(0).max(1)
const tier = integer.min(1).max(3)
// Infinity is a meaningful unreachable distance, and JSON has no representation for it.
const distance = positive.nullable()
const field = z.array(distance).length(COLS * ROWS)
const building = z.object({
  id, tower, tier, col, row, hp: positive, maxHp: positive.min(1), progress: fraction,
  cooldown: number, invested: positive, hitAge: positive, aim: number,
})
const plan = z.object({
  id, type: z.enum(['build', 'upgrade']), tower, col, row, cost: positive,
  buildingId: id.nullable(), progress: fraction,
})
const enemy = z.object({
  id, kind, element: element.nullable(), x, y, offsetX: number, offsetY: number,
  hp: positive, maxHp: positive.min(1), armor: positive, speed: positive, attack: positive,
  coins: positive, lives: positive, flying: z.boolean(), breaker: z.boolean(),
  slowTimer: number, slowFactor: positive, burnTimer: number, burnDps: positive,
  poisonTimer: number, poisonStacks: integer, poisonDps: positive,
  nextCol: col, nextRow: row, routedVersion: number.int().min(-1), routedCell: number.int().min(-1).max(COLS * ROWS - 1),
  attackingId: id.nullable(), distanceToExit: distance, heading: number, walk: positive,
})
const projectile = z.object({
  id, tower, tier, x, y, fromX: x, fromY: y, flight: positive,
  targetId: id, targetX: x, targetY: y,
})
const coin = z.object({ id, x, y, value: positive, age: positive, settle: positive })

const schema = z.object({
  version: z.literal(RUN_VERSION), levelId: id, levelSignature: z.string().max(4000),
  status: z.enum(['playing', 'won', 'lost']), clock: positive, gold: positive,
  lives: integer.max(20), maxLives: z.literal(20), randomState: integer.max(0xffffffff), nextId: id,
  gridVersion: integer, gridDirty: z.boolean(), pathBlocked: z.boolean(),
  buildings: z.array(building).max(COLS * ROWS), plans: z.array(plan).max(COLS * ROWS),
  enemies: z.array(enemy).max(2000), projectiles: z.array(projectile).max(3000), coins: z.array(coin).max(140),
  hero: z.object({
    x, y, heading: number, moving: z.boolean(), working: z.boolean(), moveTarget: point.nullable(),
    input: z.object({ x: number.min(-1).max(1), y: number.min(-1).max(1) }),
    navKey: z.string().max(20), navField: field.nullable(),
    speedLevel: integer.max(3), magnetLevel: integer.max(3), walk: positive,
  }),
  openField: field, breachField: field,
  waveNumber: integer, waveClock: positive,
  spawnQueue: z.array(z.object({ kind, at: positive, spawnIndex: integer })).max(2000),
  nextWaveIn: number.nullable(), clearBonusPending: z.boolean(),
  unlocked: z.array(element).max(6), pendingPicks: integer.max(6), kills: integer,
  goldCollected: positive, goldExpired: positive,
})

export type RunSnapshot = z.infer<typeof schema>

export function snapshotRun(state: GameState): RunSnapshot {
  const { level, waves: _waves, terrain: _terrain, spawns: _spawns, exits: _exits,
    random, rules: _rules, buildingAt: _buildingAt, events: _events, ...runtime } = state
  return {
    ...runtime,
    version: RUN_VERSION,
    maxLives: 20,
    levelId: level.id,
    levelSignature: JSON.stringify(level),
    randomState: random.state(),
    buildings: state.buildings.map((entry) => ({ ...entry })),
    plans: state.plans.map((entry) => ({ ...entry })),
    enemies: state.enemies.map((entry) => ({ ...entry, distanceToExit: finiteDistance(entry.distanceToExit) })),
    projectiles: state.projectiles.map((entry) => ({ ...entry })),
    coins: state.coins.map((entry) => ({ ...entry })),
    spawnQueue: state.spawnQueue.map((entry) => ({ ...entry })),
    unlocked: [...state.unlocked],
    openField: Array.from(state.openField, finiteDistance),
    breachField: Array.from(state.breachField, finiteDistance),
    hero: {
      ...state.hero,
      input: { ...state.hero.input },
      moveTarget: state.hero.moveTarget ? { ...state.hero.moveTarget } : null,
      navField: state.hero.navField ? Array.from(state.hero.navField, finiteDistance) : null,
    },
  }
}

/** Validate and copy at the trust boundary; unknown/prototype properties never enter the engine. */
export function parseRunSnapshot(value: unknown): RunSnapshot | null {
  const result = schema.safeParse(value)
  if (!result.success) return null
  const saved = result.data
  const level = levelById(saved.levelId)
  if (!level || saved.levelSignature !== JSON.stringify(level) || saved.waveNumber > level.waves) return null
  if (new Set(saved.unlocked).size !== saved.unlocked.length || saved.pendingPicks + saved.unlocked.length > 6) return null
  if (saved.spawnQueue.some((entry) => entry.spawnIndex >= level.map.join('').split('S').length - 1)) return null
  const ids = new Set<number>()
  for (const entry of [...saved.buildings, ...saved.plans, ...saved.enemies, ...saved.projectiles, ...saved.coins]) {
    if (entry.id >= saved.nextId || ids.has(entry.id)) return null
    ids.add(entry.id)
  }
  const occupied = new Set<number>()
  for (const entry of saved.buildings) {
    const cell = entry.row * COLS + entry.col
    if (occupied.has(cell) || level.map[entry.row]?.[entry.col] !== '.' || entry.hp > entry.maxHp) return null
    occupied.add(cell)
  }
  const jobs = new Set<string>()
  for (const entry of saved.plans) {
    const key = `${entry.col},${entry.row}`
    if (jobs.has(key)) return null
    jobs.add(key)
    if (entry.buildingId !== null) {
      const built = saved.buildings.find((candidate) => candidate.id === entry.buildingId)
      if (!built || built.col !== entry.col || built.row !== entry.row || built.tower !== entry.tower) return null
    } else if (entry.type === 'upgrade' || occupied.has(entry.row * COLS + entry.col)) return null
  }
  if (saved.hero.navKey !== '' && !/^\d{1,2},\d{1,2}$/.test(saved.hero.navKey)) return null
  return JSON.stringify(saved).length <= MAX_RUN_BYTES ? saved : null
}

export function restoreRun(saved: RunSnapshot): GameState {
  const snapshot = parseRunSnapshot(saved)
  if (!snapshot) throw new Error('This Tower Defense run is incompatible or damaged.')
  const level = levelById(snapshot.levelId)
  if (!level) throw new Error('Unknown Tower Defense level')
  const state = createGameState(level, snapshot.randomState)
  const { version: _version, levelId: _id, levelSignature: _signature, randomState, ...runtime } = snapshot
  Object.assign(state, runtime, {
    random: createRandom(randomState),
    hero: { ...runtime.hero, navField: restoreField(runtime.hero.navField) },
    enemies: runtime.enemies.map((entry) => ({ ...entry, distanceToExit: entry.distanceToExit ?? Number.POSITIVE_INFINITY })),
    openField: restoreField(runtime.openField),
    breachField: restoreField(runtime.breachField),
    events: [],
  })
  // createGameState's rules close over this same state; every index points at its own buildings.
  state.buildingAt.fill(null)
  for (const entry of state.buildings) state.buildingAt[entry.row * COLS + entry.col] = entry
  return state
}

function finiteDistance(value: number): number | null {
  return value === Number.POSITIVE_INFINITY ? null : value
}
function restoreField(value: (number | null)[] | null): Float64Array | null {
  return value === null ? null : Float64Array.from(value, (entry) => entry ?? Number.POSITIVE_INFINITY)
}
