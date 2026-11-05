import {
  ELEMENT_IDS,
  elementMultiplier,
  ENEMIES,
  HERO_UPGRADES,
  heroMagnet,
  heroSpeed,
  SELL_REFUND,
  TOWERS,
  towerStats,
  upgradeCost,
} from './catalog'
import {
  type Building,
  type CellPosition,
  type Coin,
  COLS,
  type ElementId,
  type Enemy,
  type EnemyKind,
  type GameEvent,
  type GameState,
  type HeroUpgrade,
  type HudSnapshot,
  type LevelDef,
  type Plan,
  type Projectile,
  type RandomSource,
  ROWS,
  type Terrain,
  type TowerId,
  type WaveDef,
} from './gameTypes'
import { buildWaves } from './levels'
import { bestStep, cellIndex, computeField, type FieldRules, inBounds, UNREACHABLE } from './pathfinding'

export const STARTING_LIVES = 20
export const FIRST_WAVE_SECONDS = 30
export const BETWEEN_WAVES_SECONDS = 24
/** Once the field is empty there is little to wait for, so the countdown shortens to this. */
export const CLEAR_FIELD_SECONDS = 12
export const COIN_LIFETIME_SECONDS = 32
export const COIN_WARNING_SECONDS = 7
export const COIN_SETTLE_SECONDS = 0.45
const COIN_LIMIT = 140
const COIN_PICKUP_RADIUS = 0.55
const COIN_MAGNET_SPEED = 9
/** An idle hero runs over to coins this close, so a tap near a pile sweeps up the pile. */
const SWEEP_RADIUS = 3.2
const BUILD_REACH = 1.45
const REPAIR_REACH = 1.6
const REPAIR_PER_SECOND = 14
const UPGRADE_SECONDS = 0.9
/** Hero's cost to climb over a building, rather than walking round it. */
const HERO_CLIMB_COST = 6
const ATTACK_REACH = 0.98
/** Fraction of the remaining countdown paid as a bonus for calling a wave early. */
const EARLY_CALL_BONUS_PER_SECOND = 0.6
const HERO_ARRIVE_DISTANCE = 0.08

export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: col + 0.5, y: row + 0.5 }
}

function parseTerrain(level: LevelDef): { terrain: Terrain[]; spawns: CellPosition[]; exits: CellPosition[] } {
  const terrain: Terrain[] = []
  const spawns: CellPosition[] = []
  const exits: CellPosition[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const char = level.map[row]?.[col] ?? '.'
      if (char === 'S') {
        spawns.push({ col, row })
        terrain.push('spawn')
      } else if (char === 'E') {
        exits.push({ col, row })
        terrain.push('exit')
      } else {
        terrain.push(char === '#' ? 'rock' : char === '~' ? 'water' : char === ',' ? 'pad' : 'ground')
      }
    }
  }
  // Nothing can be built right against a spawn or the keep, so neither can be sealed flush.
  for (const { col, row } of [...spawns, ...exits]) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (inBounds(col + dx, row + dy) && terrain[cellIndex(col + dx, row + dy)] === 'ground') {
          terrain[cellIndex(col + dx, row + dy)] = 'pad'
        }
      }
    }
  }

  return { terrain, spawns, exits }
}

export function createGameState(level: LevelDef, seed = level.id * 7919): GameState {
  const { terrain, spawns, exits } = parseTerrain(level)
  const firstExit = exits[0] ?? { col: 0, row: 0 }
  const start = cellCenter(firstExit.col, Math.max(0, firstExit.row - 2))
  const state: GameState = {
    level,
    waves: buildWaves(level),
    status: 'playing',
    clock: 0,
    gold: level.startGold,
    lives: STARTING_LIVES,
    maxLives: STARTING_LIVES,
    terrain,
    spawns,
    exits,
    buildings: [],
    buildingAt: new Array<Building | null>(COLS * ROWS).fill(null),
    plans: [],
    enemies: [],
    projectiles: [],
    coins: [],
    hero: {
      x: start.x,
      y: start.y,
      heading: 0,
      moving: false,
      working: false,
      moveTarget: null,
      input: { x: 0, y: 0 },
      navField: null,
      navKey: '',
      speedLevel: 0,
      magnetLevel: 0,
      walk: 0,
    },
    events: [],
    random: createRandom(seed),
    nextId: 1,
    gridVersion: 0,
    gridDirty: true,
    rules: { open: noRules, breach: noRules, hero: noRules },
    openField: new Float64Array(0),
    breachField: new Float64Array(0),
    pathBlocked: false,
    waveNumber: 0,
    waveClock: 0,
    spawnQueue: [],
    nextWaveIn: FIRST_WAVE_SECONDS,
    clearBonusPending: false,
    unlocked: [],
    pendingPicks: level.picksAfter.includes(0) ? 1 : 0,
    kills: 0,
    goldCollected: 0,
    goldExpired: 0,
  }
  state.rules = createRules(state)
  refreshGrid(state)

  return state
}

const noRules: FieldRules = { cost: () => UNREACHABLE, blocksCorner: () => true }

function createRules(state: GameState): GameState['rules'] {
  const terrainBlocks = (index: number): boolean => isTerrainBlocked(state.terrain[index])
  const solid = (index: number): boolean => terrainBlocks(index) || state.buildingAt[index] != null

  return {
    open: { cost: (index) => (solid(index) ? UNREACHABLE : 1), blocksCorner: solid },
    breach: {
      // Tougher buildings are costlier to break, so attackers look for the weak point.
      cost: (index) => {
        if (terrainBlocks(index)) {
          return UNREACHABLE
        }
        const building = state.buildingAt[index]

        return building ? 1 + (building.hp / 30) : 1
      },
      blocksCorner: solid,
    },
    // The hero can scramble over buildings, so it can never be walled in.
    hero: {
      cost: (index) => {
        if (terrainBlocks(index)) {
          return UNREACHABLE
        }

        return state.buildingAt[index] ? HERO_CLIMB_COST : 1
      },
      blocksCorner: terrainBlocks,
    },
  }
}

/** mulberry32: a whole game replays exactly from its seed, which the tests rely on. */
export function createRandom(seed: number): RandomSource {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return Object.assign(next, { state: () => a })
}

function isTerrainBlocked(terrain: Terrain | undefined): boolean {
  return terrain === undefined || terrain === 'rock' || terrain === 'water'
}

function refreshGrid(state: GameState): void {
  const goals = state.exits.map(({ col, row }) => cellIndex(col, row))
  state.openField = computeField(goals, state.rules.open)
  state.breachField = computeField(goals, state.rules.breach)
  const wasBlocked = state.pathBlocked
  state.pathBlocked = state.spawns.some(({ col, row }) => !Number.isFinite(state.openField[cellIndex(col, row)] ?? UNREACHABLE))
  if (wasBlocked !== state.pathBlocked) {
    pushEvent(state, { type: 'pathBlocked', blocked: state.pathBlocked })
  }
  state.gridVersion += 1
  state.gridDirty = false
  state.hero.navKey = ''
}

function pushEvent(state: GameState, event: GameEvent): void {
  state.events.push(event)
}

export function drainEvents(state: GameState): GameEvent[] {
  const events = state.events
  state.events = []

  return events
}

// ---------------------------------------------------------------------------
// Player commands
// ---------------------------------------------------------------------------

export function isUnlocked(state: GameState, tower: TowerId): boolean {
  const element = TOWERS[tower].element

  return element === null || state.unlocked.includes(element)
}

export type PlacementProblem = 'terrain' | 'occupied' | 'gold' | 'locked'

/** Why a building cannot go here, or null if it can. Blocking the path is allowed on purpose. */
export function placementProblem(state: GameState, tower: TowerId, col: number, row: number): PlacementProblem | null {
  if (!isUnlocked(state, tower)) {
    return 'locked'
  }
  if (!inBounds(col, row) || state.terrain[cellIndex(col, row)] !== 'ground') {
    return 'terrain'
  }
  if (state.buildingAt[cellIndex(col, row)] || state.plans.some((plan) => plan.col === col && plan.row === row)) {
    return 'occupied'
  }

  return state.gold < TOWERS[tower].costs[0] ? 'gold' : null
}

/** Pays for a building and queues it for the hero. */
export function orderBuild(state: GameState, tower: TowerId, col: number, row: number): boolean {
  if (state.status !== 'playing' || placementProblem(state, tower, col, row)) {
    return false
  }
  const cost = TOWERS[tower].costs[0]
  state.gold -= cost
  state.plans.push({ id: takeId(state), type: 'build', tower, col, row, cost, buildingId: null, progress: 0 })

  return true
}

export function orderUpgrade(state: GameState, buildingId: number): boolean {
  const building = state.buildings.find((entry) => entry.id === buildingId)
  if (state.status !== 'playing' || !building || building.progress < 1 || state.plans.some((plan) => plan.buildingId === buildingId)) {
    return false
  }
  const cost = upgradeCost(building.tower, building.tier)
  if (cost === null || state.gold < cost) {
    return false
  }
  state.gold -= cost
  state.plans.push({ id: takeId(state), type: 'upgrade', tower: building.tower, col: building.col, row: building.row, cost, buildingId, progress: 0 })

  return true
}

/** Takes a queued job back and refunds it. A building already going up is sold instead. */
export function cancelPlan(state: GameState, planId: number): boolean {
  const plan = state.plans.find((entry) => entry.id === planId)
  if (!plan || (plan.type === 'build' && plan.buildingId !== null)) {
    return false
  }
  state.plans = state.plans.filter((entry) => entry !== plan)
  state.gold += plan.cost

  return true
}

export function sellValue(building: Building): number {
  return Math.floor(building.invested * SELL_REFUND)
}

export function sellBuilding(state: GameState, buildingId: number): boolean {
  const building = state.buildings.find((entry) => entry.id === buildingId)
  if (state.status !== 'playing' || !building) {
    return false
  }
  // A building the hero never finished comes back in full.
  state.gold += building.progress < 1 ? building.invested : sellValue(building)
  removeBuilding(state, building)
  pushEvent(state, { type: 'sold', ...cellCenter(building.col, building.row) })

  return true
}

export function buyHeroUpgrade(state: GameState, upgrade: HeroUpgrade): boolean {
  const level = upgrade === 'boots' ? state.hero.speedLevel : state.hero.magnetLevel
  const cost = HERO_UPGRADES[upgrade].costs[level]
  if (cost === undefined || state.gold < cost || state.status !== 'playing') {
    return false
  }
  state.gold -= cost
  if (upgrade === 'boots') {
    state.hero.speedLevel += 1
  } else {
    state.hero.magnetLevel += 1
  }

  return true
}

/** Sends the hero somewhere. Queued jobs wait until it arrives. */
export function moveHero(state: GameState, x: number, y: number): void {
  state.hero.moveTarget = { x: clamp(x, 0.1, COLS - 0.1), y: clamp(y, 0.1, ROWS - 0.1) }
}

/** Keyboard steering; a zero vector hands control back to the queue. */
export function setHeroInput(state: GameState, x: number, y: number): void {
  state.hero.input = { x, y }
  if (x !== 0 || y !== 0) {
    state.hero.moveTarget = null
  }
}

/** Starts the next wave now, paying a bonus for the time given up. */
export function callNextWave(state: GameState): number | null {
  if (state.status !== 'playing' || state.nextWaveIn === null || state.waveNumber >= state.waves.length || state.pendingPicks > 0) {
    return null
  }
  const bonus = Math.ceil(state.nextWaveIn * EARLY_CALL_BONUS_PER_SECOND)
  state.gold += bonus
  startWave(state)

  return bonus
}

export function pickElement(state: GameState, element: ElementId): boolean {
  if (state.pendingPicks <= 0 || state.unlocked.includes(element)) {
    return false
  }
  state.unlocked = [...state.unlocked, element]
  state.pendingPicks -= 1

  return true
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** One fixed step. Nothing moves while the player owes an element choice. */
export function tickGame(state: GameState, dt: number): void {
  if (state.status !== 'playing' || state.pendingPicks > 0) {
    return
  }
  state.clock += dt
  if (state.gridDirty) {
    refreshGrid(state)
  }
  tickWaves(state, dt)
  tickHero(state, dt)
  tickBuildings(state, dt)
  tickProjectiles(state, dt)
  tickEnemies(state, dt)
  tickCoins(state, dt)
  if (state.gridDirty) {
    refreshGrid(state)
  }
  if (state.lives <= 0) {
    state.lives = 0
    state.status = 'lost'
  } else if (state.waveNumber >= state.waves.length && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.status = 'won'
  }
}

function takeId(state: GameState): number {
  const id = state.nextId
  state.nextId += 1

  return id
}

function startWave(state: GameState): void {
  const wave = state.waves[state.waveNumber]
  if (!wave) {
    return
  }
  state.waveNumber = wave.number
  state.waveClock = 0
  state.nextWaveIn = null
  state.clearBonusPending = true
  const spawnCount = Math.max(1, state.spawns.length)
  let counter = 0
  for (const group of wave.groups) {
    for (let index = 0; index < group.count; index += 1) {
      state.spawnQueue.push({ kind: group.kind, at: group.delay + (index * group.interval), spawnIndex: counter % spawnCount })
      counter += 1
    }
  }
  state.spawnQueue.sort((a, b) => a.at - b.at)
  pushEvent(state, { type: 'waveStart', wave: wave.number, boss: wave.boss })
}

function tickWaves(state: GameState, dt: number): void {
  if (state.nextWaveIn !== null) {
    if (state.enemies.length === 0) {
      state.nextWaveIn = Math.min(state.nextWaveIn, state.waveNumber === 0 ? FIRST_WAVE_SECONDS : CLEAR_FIELD_SECONDS)
    }
    state.nextWaveIn -= dt
    if (state.nextWaveIn <= 0) {
      startWave(state)
    }
  }

  state.waveClock += dt
  const wave = state.waves[state.waveNumber - 1]
  while (wave && (state.spawnQueue[0]?.at ?? UNREACHABLE) <= state.waveClock) {
    const entry = state.spawnQueue.shift()
    if (entry) {
      spawnEnemy(state, entry.kind, wave, entry.spawnIndex)
    }
  }

  if (wave && state.spawnQueue.length === 0 && state.nextWaveIn === null && state.waveNumber < state.waves.length) {
    state.nextWaveIn = BETWEEN_WAVES_SECONDS
    if (state.level.picksAfter.includes(wave.number) && state.unlocked.length + state.pendingPicks < ELEMENT_IDS.length) {
      state.pendingPicks += 1
    }
  }

  if (wave && state.clearBonusPending && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.clearBonusPending = false
    const bonus = 10 + (wave.number * 3)
    state.gold += bonus
    pushEvent(state, { type: 'waveCleared', wave: wave.number, bonus })
  }
}

function spawnEnemy(state: GameState, kind: EnemyKind, wave: WaveDef, spawnIndex: number): void {
  const spawn = state.spawns[spawnIndex] ?? state.spawns[0]
  if (!spawn) {
    return
  }
  const def = ENEMIES[kind]
  const center = cellCenter(spawn.col, spawn.row)
  const hp = Math.max(1, Math.round(def.hp * wave.hpMultiplier))
  const spread = kind === 'boss' ? 0.05 : 0.27
  state.enemies.push({
    id: takeId(state),
    kind,
    element: wave.element,
    x: center.x,
    y: center.y,
    offsetX: (state.random() - 0.5) * 2 * spread,
    offsetY: (state.random() - 0.5) * 2 * spread,
    hp,
    maxHp: hp,
    armor: def.armor,
    speed: def.speed,
    attack: def.attack * (1 + (wave.number * 0.05)),
    coins: Math.max(1, Math.round(def.coins * wave.coinMultiplier)),
    lives: def.lives,
    flying: def.flying,
    breaker: def.breaker,
    slowTimer: 0,
    slowFactor: 1,
    burnTimer: 0,
    burnDps: 0,
    poisonTimer: 0,
    poisonStacks: 0,
    poisonDps: 0,
    nextCol: spawn.col,
    nextRow: spawn.row,
    routedVersion: -1,
    routedCell: -1,
    attackingId: null,
    distanceToExit: UNREACHABLE,
    heading: 0,
    walk: state.random() * 6,
  })
}

// --- Hero ------------------------------------------------------------------

function heroNavigate(state: GameState, x: number, y: number, dt: number): boolean {
  const hero = state.hero
  const wantedCol = clamp(Math.floor(x), 0, COLS - 1)
  const wantedRow = clamp(Math.floor(y), 0, ROWS - 1)
  const goal = nearestWalkable(state, wantedCol, wantedRow)
  const targetCol = goal % COLS
  const targetRow = Math.floor(goal / COLS)
  // A tap on a rock or the water heads for the closest ground instead.
  const exactX = targetCol === wantedCol && targetRow === wantedRow ? x : targetCol + 0.5
  const exactY = targetCol === wantedCol && targetRow === wantedRow ? y : targetRow + 0.5
  const key = `${targetCol},${targetRow}`
  if (hero.navKey !== key || !hero.navField) {
    hero.navKey = key
    hero.navField = computeField([goal], state.rules.hero)
  }
  const col = clamp(Math.floor(hero.x), 0, COLS - 1)
  const row = clamp(Math.floor(hero.y), 0, ROWS - 1)
  const step = bestStep(hero.navField, col, row, state.rules.hero)
  // The last leg heads for the exact spot, not the cell's centre.
  const lastLeg = !step || (step.col === targetCol && step.row === targetRow)

  return stepHero(state, lastLeg ? exactX : (step.col + 0.5), lastLeg ? exactY : (step.row + 0.5), dt)
}

/** Moves the hero toward a point; true once there. */
function stepHero(state: GameState, x: number, y: number, dt: number): boolean {
  const hero = state.hero
  const dx = x - hero.x
  const dy = y - hero.y
  const distance = Math.hypot(dx, dy)
  if (distance < HERO_ARRIVE_DISTANCE) {
    return true
  }
  const step = Math.min(distance, heroSpeed(hero.speedLevel) * dt)
  hero.x += (dx / distance) * step
  hero.y += (dy / distance) * step
  hero.heading = Math.atan2(dy, dx)
  hero.moving = true
  hero.walk += step

  return false
}

function nearestWalkable(state: GameState, col: number, row: number): number {
  const here = cellIndex(col, row)
  if (!isTerrainBlocked(state.terrain[here])) {
    return here
  }
  let best = here
  let bestDistance = UNREACHABLE
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const distance = Math.hypot(c - col, r - row)
      if (distance < bestDistance && !isTerrainBlocked(state.terrain[cellIndex(c, r)])) {
        best = cellIndex(c, r)
        bestDistance = distance
      }
    }
  }

  return best
}

function tickHero(state: GameState, dt: number): void {
  const hero = state.hero
  hero.moving = false
  hero.working = false

  const inputLength = Math.hypot(hero.input.x, hero.input.y)
  if (inputLength > 0) {
    const step = heroSpeed(hero.speedLevel) * dt / inputLength
    const nextX = clamp(hero.x + (hero.input.x * step), 0.05, COLS - 0.05)
    const nextY = clamp(hero.y + (hero.input.y * step), 0.05, ROWS - 0.05)
    if (!isTerrainBlocked(state.terrain[cellIndex(Math.floor(nextX), Math.floor(hero.y))])) {
      hero.x = nextX
    }
    if (!isTerrainBlocked(state.terrain[cellIndex(Math.floor(hero.x), Math.floor(nextY))])) {
      hero.y = nextY
    }
    hero.heading = Math.atan2(hero.input.y, hero.input.x)
    hero.moving = true
    hero.walk += heroSpeed(hero.speedLevel) * dt
  } else if (hero.moveTarget) {
    if (heroNavigate(state, hero.moveTarget.x, hero.moveTarget.y, dt)) {
      hero.moveTarget = null
    }
  } else {
    const worked = tickHeroJobs(state, dt)
    if (!worked && !sweepCoins(state, dt)) {
      repairNearby(state, dt)
    }
  }
}

/** Works on the current job, walking to it first. False if there is nothing queued. */
function tickHeroJobs(state: GameState, dt: number): boolean {
  const hero = state.hero
  if (state.plans.length === 0) {
    return false
  }
  // Finish what is already underway, otherwise take the closest job.
  const plan = state.plans.find((entry) => entry.type === 'build' && entry.buildingId !== null)
    ?? state.plans.reduce<Plan | null>((closest, entry) => {
      if (!closest) {
        return entry
      }

      return planDistance(hero, entry) < planDistance(hero, closest) ? entry : closest
    }, null)
  if (!plan) {
    return false
  }
  if (planDistance(hero, plan) > BUILD_REACH) {
    const center = cellCenter(plan.col, plan.row)
    heroNavigate(state, center.x, center.y, dt)

    return true
  }
  hero.heading = Math.atan2((plan.row + 0.5) - hero.y, (plan.col + 0.5) - hero.x)

  if (plan.type === 'upgrade') {
    const building = state.buildings.find((entry) => entry.id === plan.buildingId)
    if (!building) {
      state.plans = state.plans.filter((entry) => entry !== plan)

      return true
    }
    hero.working = true
    plan.progress += dt / UPGRADE_SECONDS
    if (plan.progress >= 1) {
      finishUpgrade(state, building, plan)
    }

    return true
  }

  if (plan.buildingId === null) {
    if (enemyInCell(state, plan.col, plan.row)) {
      // Wait for the cell to clear rather than building on top of someone.
      return true
    }
    startBuilding(state, plan)
  }
  const building = state.buildings.find((entry) => entry.id === plan.buildingId)
  if (!building) {
    // Destroyed while it was going up; the gold is lost with it.
    state.plans = state.plans.filter((entry) => entry !== plan)

    return true
  }
  hero.working = true
  building.progress = Math.min(1, building.progress + (dt / TOWERS[building.tower].buildSeconds))
  if (building.progress >= 1) {
    state.plans = state.plans.filter((entry) => entry !== plan)
    pushEvent(state, { type: 'built', tower: building.tower, ...cellCenter(building.col, building.row) })
  }

  return true
}

function planDistance(hero: { x: number; y: number }, plan: CellPosition): number {
  return Math.hypot((plan.col + 0.5) - hero.x, (plan.row + 0.5) - hero.y)
}

function enemyInCell(state: GameState, col: number, row: number): boolean {
  return state.enemies.some((enemy) => !enemy.flying && Math.floor(enemy.x) === col && Math.floor(enemy.y) === row)
}

function startBuilding(state: GameState, plan: Plan): void {
  const hp = towerStats(plan.tower, 1).hp
  const building: Building = {
    id: takeId(state),
    tower: plan.tower,
    tier: 1,
    col: plan.col,
    row: plan.row,
    hp,
    maxHp: hp,
    progress: 0,
    cooldown: 0,
    invested: plan.cost,
    hitAge: 10,
    aim: 0,
  }
  plan.buildingId = building.id
  state.buildings.push(building)
  state.buildingAt[cellIndex(plan.col, plan.row)] = building
  state.gridDirty = true
  pushEvent(state, { type: 'buildStart', ...cellCenter(plan.col, plan.row) })
}

function finishUpgrade(state: GameState, building: Building, plan: Plan): void {
  building.tier += 1
  building.invested += plan.cost
  const stats = towerStats(building.tower, building.tier)
  building.maxHp = stats.hp
  building.hp = stats.hp
  // Enemies weigh a building's health when choosing where to break through.
  state.gridDirty = true
  state.plans = state.plans.filter((entry) => entry !== plan)
  pushEvent(state, { type: 'upgraded', ...cellCenter(building.col, building.row) })
}

function sweepCoins(state: GameState, dt: number): boolean {
  const hero = state.hero
  let nearest: Coin | null = null
  let nearestDistance = SWEEP_RADIUS
  for (const coin of state.coins) {
    const distance = Math.hypot(coin.x - hero.x, coin.y - hero.y)
    if (distance < nearestDistance) {
      nearest = coin
      nearestDistance = distance
    }
  }
  if (!nearest) {
    return false
  }
  heroNavigate(state, nearest.x, nearest.y, dt)

  return true
}

function repairNearby(state: GameState, dt: number): void {
  const hero = state.hero
  for (const building of state.buildings) {
    if (building.hp < building.maxHp && building.progress >= 1 && Math.hypot((building.col + 0.5) - hero.x, (building.row + 0.5) - hero.y) <= REPAIR_REACH) {
      building.hp = Math.min(building.maxHp, building.hp + (REPAIR_PER_SECOND * dt))
      hero.working = true

      return
    }
  }
}

// --- Buildings -------------------------------------------------------------

function removeBuilding(state: GameState, building: Building): void {
  state.buildings = state.buildings.filter((entry) => entry !== building)
  state.buildingAt[cellIndex(building.col, building.row)] = null
  for (const plan of state.plans) {
    // An upgrade the hero had not finished was never applied, so its gold comes back.
    if (plan.buildingId === building.id && plan.type === 'upgrade') {
      state.gold += plan.cost
    }
  }
  state.plans = state.plans.filter((plan) => plan.buildingId !== building.id)
  state.gridDirty = true
}

function tickBuildings(state: GameState, dt: number): void {
  for (const building of state.buildings) {
    building.hitAge += dt
    const def = TOWERS[building.tower]
    if (def.damage <= 0 || building.progress < 1) {
      continue
    }
    building.cooldown -= dt
    if (building.cooldown > 0) {
      continue
    }
    const stats = towerStats(building.tower, building.tier)
    const target = chooseTarget(state, building, stats.range)
    if (!target) {
      building.cooldown = 0
      continue
    }
    building.cooldown = def.cooldown
    const x = building.col + 0.5
    const y = building.row + 0.5
    building.aim = Math.atan2(target.y - y, target.x - x)
    pushEvent(state, { type: 'fire', tower: building.tower, x, y })
    if (def.projectileSpeed <= 0) {
      fireBeam(state, building, target)
    } else {
      state.projectiles.push({
        id: takeId(state),
        tower: building.tower,
        tier: building.tier,
        x,
        y,
        fromX: x,
        fromY: y,
        flight: Math.max(0.2, Math.hypot(target.x - x, target.y - y)),
        targetId: target.id,
        targetX: target.x,
        targetY: target.y,
      })
    }
  }
}

function chooseTarget(state: GameState, building: Building, range: number): Enemy | null {
  const def = TOWERS[building.tower]
  const x = building.col + 0.5
  const y = building.row + 0.5
  let best: Enemy | null = null
  let bestScore = UNREACHABLE
  for (const enemy of state.enemies) {
    if ((enemy.flying && !def.hitsAir) || Math.hypot(enemy.x - x, enemy.y - y) > range) {
      continue
    }
    // Lower is better: closest to the keep, or toughest for towers that hunt health.
    let score = def.targetsToughest ? -enemy.hp : enemy.distanceToExit
    // A frost tower spreads its chill instead of re-chilling the same enemy.
    if (def.slow && enemy.slowTimer > 0.4) {
      score += 1000
    }
    if (score < bestScore) {
      best = enemy
      bestScore = score
    }
  }

  return best
}

function fireBeam(state: GameState, building: Building, first: Enemy): void {
  const def = TOWERS[building.tower]
  const stats = towerStats(building.tower, building.tier)
  const points = [{ x: building.col + 0.5, y: building.row + 0.5 }]
  const struck = new Set<number>()
  let current: Enemy | null = first
  let damage = stats.damage
  for (let jump = 0; current && jump < (def.chain ?? 1); jump += 1) {
    const here: Enemy = current
    struck.add(here.id)
    points.push({ x: here.x, y: here.y })
    damageEnemy(state, here, damage, def.element)
    damage *= 0.75
    let next: Enemy | null = null
    let nextDistance = 2.2
    for (const enemy of state.enemies) {
      const distance = Math.hypot(enemy.x - here.x, enemy.y - here.y)
      if (!struck.has(enemy.id) && enemy.hp > 0 && distance < nextDistance) {
        next = enemy
        nextDistance = distance
      }
    }
    current = next
  }
  pushEvent(state, { type: 'beam', points })
}

function tickProjectiles(state: GameState, dt: number): void {
  const remaining: Projectile[] = []
  for (const shot of state.projectiles) {
    const target = state.enemies.find((enemy) => enemy.id === shot.targetId)
    if (target) {
      shot.targetX = target.x
      shot.targetY = target.y
    }
    const dx = shot.targetX - shot.x
    const dy = shot.targetY - shot.y
    const distance = Math.hypot(dx, dy)
    const step = TOWERS[shot.tower].projectileSpeed * dt
    if (distance <= step) {
      landShot(state, shot, target ?? null)
    } else {
      shot.x += (dx / distance) * step
      shot.y += (dy / distance) * step
      remaining.push(shot)
    }
  }
  state.projectiles = remaining
}

function landShot(state: GameState, shot: Projectile, target: Enemy | null): void {
  const def = TOWERS[shot.tower]
  const stats = towerStats(shot.tower, shot.tier)
  pushEvent(state, { type: 'hit', tower: shot.tower, x: shot.targetX, y: shot.targetY, splash: def.splash })
  if (def.splash > 0) {
    for (const enemy of [...state.enemies]) {
      if ((enemy.flying && !def.hitsAir) || Math.hypot(enemy.x - shot.targetX, enemy.y - shot.targetY) > def.splash) {
        continue
      }
      applyShot(state, def.id, stats, enemy)
    }

    return
  }
  // A single-target shot whose target died on the way fizzles.
  if (target && target.hp > 0) {
    applyShot(state, def.id, stats, target)
  }
}

function applyShot(state: GameState, tower: TowerId, stats: { damage: number; scale: number }, enemy: Enemy): void {
  const def = TOWERS[tower]
  if (def.slow) {
    enemy.slowTimer = Math.max(enemy.slowTimer, def.slow.seconds)
    // Bosses resist being slowed, but not entirely.
    enemy.slowFactor = enemy.kind === 'boss' ? Math.max(def.slow.factor, 0.75) : def.slow.factor
  }
  if (def.burn) {
    enemy.burnTimer = def.burn.seconds
    enemy.burnDps = Math.max(enemy.burnDps, def.burn.dps * stats.scale)
  }
  if (def.poison) {
    enemy.poisonTimer = def.poison.seconds
    enemy.poisonStacks = Math.min(def.poison.maxStacks, enemy.poisonStacks + 1)
    enemy.poisonDps = Math.max(enemy.poisonDps, def.poison.dps * stats.scale)
  }
  const extra = def.currentHpDamage ? enemy.hp * def.currentHpDamage : 0
  damageEnemy(state, enemy, stats.damage + extra, def.element)
}

function damageEnemy(state: GameState, enemy: Enemy, raw: number, element: ElementId | null): void {
  if (enemy.hp <= 0) {
    return
  }
  const dealt = Math.max(1, (raw * elementMultiplier(element, enemy.element)) - enemy.armor)
  enemy.hp -= dealt
  if (enemy.hp <= 0) {
    killEnemy(state, enemy)
  }
}

function killEnemy(state: GameState, enemy: Enemy): void {
  state.enemies = state.enemies.filter((entry) => entry !== enemy)
  state.kills += 1
  pushEvent(state, { type: 'death', kind: enemy.kind, x: enemy.x, y: enemy.y })
  dropCoins(state, enemy)
}

function dropCoins(state: GameState, enemy: Enemy): void {
  // Split into at most five coins, so a big kill scatters a pile without flooding the board.
  const pieces = Math.min(5, Math.max(1, Math.ceil(enemy.coins / 3)))
  let left = enemy.coins
  for (let piece = 0; piece < pieces; piece += 1) {
    const value = piece === pieces - 1 ? left : Math.max(1, Math.round(enemy.coins / pieces))
    left -= value
    const angle = state.random() * Math.PI * 2
    const radius = pieces === 1 ? 0.1 : 0.2 + (state.random() * 0.45)
    let x = clamp(enemy.x + (Math.cos(angle) * radius), 0.2, COLS - 0.2)
    let y = clamp(enemy.y + (Math.sin(angle) * radius), 0.2, ROWS - 0.2)
    // A flyer shot down over the water still drops its gold on the shore.
    const land = nearestWalkable(state, Math.floor(x), Math.floor(y))
    if (land !== cellIndex(Math.floor(x), Math.floor(y))) {
      x = (land % COLS) + 0.5 + ((state.random() - 0.5) * 0.5)
      y = Math.floor(land / COLS) + 0.5 + ((state.random() - 0.5) * 0.5)
    }
    state.coins.push({ id: takeId(state), x, y, value, age: 0, settle: COIN_SETTLE_SECONDS })
  }
  // Past the limit, the oldest coins fold into the coin nearest them so no gold is lost.
  while (state.coins.length > COIN_LIMIT) {
    const oldest = state.coins.shift()
    if (!oldest) {
      break
    }
    let nearest: Coin | undefined
    let nearestDistance = UNREACHABLE
    for (const coin of state.coins) {
      const distance = Math.hypot(coin.x - oldest.x, coin.y - oldest.y)
      if (distance < nearestDistance) {
        nearest = coin
        nearestDistance = distance
      }
    }
    if (nearest) {
      nearest.value += oldest.value
    }
  }
}

// --- Enemies ---------------------------------------------------------------

function tickEnemies(state: GameState, dt: number): void {
  const firstExit = state.exits[0]
  for (const enemy of [...state.enemies]) {
    applyStatuses(state, enemy, dt)
    if (enemy.hp <= 0) {
      continue
    }
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt)
    const speed = enemy.speed * (enemy.slowTimer > 0 ? enemy.slowFactor : 1)
    if (enemy.flying) {
      flyEnemy(state, enemy, speed, dt, firstExit)
    } else {
      walkEnemy(state, enemy, speed, dt)
    }
  }
}

function applyStatuses(state: GameState, enemy: Enemy, dt: number): void {
  let damage = 0
  if (enemy.burnTimer > 0) {
    enemy.burnTimer -= dt
    damage += enemy.burnDps * dt
    if (enemy.burnTimer <= 0) {
      enemy.burnDps = 0
    }
  }
  if (enemy.poisonTimer > 0) {
    enemy.poisonTimer -= dt
    damage += enemy.poisonDps * enemy.poisonStacks * dt
    if (enemy.poisonTimer <= 0) {
      enemy.poisonStacks = 0
      enemy.poisonDps = 0
    }
  }
  if (damage > 0) {
    // Burn and poison ignore armour, which is what makes them good against brutes.
    enemy.hp -= damage
    if (enemy.hp <= 0) {
      killEnemy(state, enemy)
    }
  }
}

function flyEnemy(state: GameState, enemy: Enemy, speed: number, dt: number, exit: CellPosition | undefined): void {
  if (!exit) {
    return
  }
  const dx = exit.col + 0.5 - enemy.x
  const dy = exit.row + 0.5 - enemy.y
  const distance = Math.hypot(dx, dy)
  enemy.distanceToExit = distance
  if (distance < 0.4) {
    leak(state, enemy)

    return
  }
  enemy.x += (dx / distance) * speed * dt
  enemy.y += (dy / distance) * speed * dt
  enemy.heading = Math.atan2(dy, dx)
  enemy.walk += speed * dt
}

function walkEnemy(state: GameState, enemy: Enemy, speed: number, dt: number): void {
  const col = clamp(Math.floor(enemy.x), 0, COLS - 1)
  const row = clamp(Math.floor(enemy.y), 0, ROWS - 1)
  const here = cellIndex(col, row)
  const openHere = state.openField[here] ?? UNREACHABLE
  // Blocked walkers follow the breach field; sappers always do, so long mazes cannot hold them.
  const field = enemy.breaker || !Number.isFinite(openHere) ? state.breachField : state.openField
  enemy.distanceToExit = field[here] ?? UNREACHABLE

  if (state.terrain[here] === 'exit') {
    leak(state, enemy)

    return
  }
  if (enemy.routedVersion !== state.gridVersion || enemy.routedCell !== here) {
    enemy.routedVersion = state.gridVersion
    enemy.routedCell = here
    const step = bestStep(field, col, row, field === state.breachField ? state.rules.breach : state.rules.open)
    enemy.nextCol = step?.col ?? col
    enemy.nextRow = step?.row ?? row
  }

  const blocker = state.buildingAt[cellIndex(enemy.nextCol, enemy.nextRow)]
  const goalX = enemy.nextCol + 0.5 + (blocker ? 0 : enemy.offsetX)
  const goalY = enemy.nextRow + 0.5 + (blocker ? 0 : enemy.offsetY)
  const dx = goalX - enemy.x
  const dy = goalY - enemy.y
  const distance = Math.hypot(dx, dy)
  if (distance > 0.001) {
    enemy.heading = Math.atan2(dy, dx)
  }

  if (blocker && distance <= ATTACK_REACH) {
    enemy.attackingId = blocker.id
    strikeBuilding(state, enemy, blocker, dt)

    return
  }
  enemy.attackingId = null
  if (distance > 0.001) {
    const step = Math.min(distance, speed * dt)
    enemy.x += (dx / distance) * step
    enemy.y += (dy / distance) * step
    enemy.walk += step
  }
}

function strikeBuilding(state: GameState, enemy: Enemy, building: Building, dt: number): void {
  building.hp -= enemy.attack * dt
  if (building.hitAge > 0.35) {
    building.hitAge = 0
    pushEvent(state, { type: 'strike', x: building.col + 0.5, y: building.row + 0.5 })
  }
  if (building.hp <= 0) {
    pushEvent(state, { type: 'destroyed', tower: building.tower, x: building.col + 0.5, y: building.row + 0.5 })
    removeBuilding(state, building)
  }
}

function leak(state: GameState, enemy: Enemy): void {
  state.enemies = state.enemies.filter((entry) => entry !== enemy)
  state.lives -= enemy.lives
  pushEvent(state, { type: 'leak', lives: enemy.lives })
}

// --- Coins -----------------------------------------------------------------

function tickCoins(state: GameState, dt: number): void {
  const hero = state.hero
  const magnet = heroMagnet(hero.magnetLevel)
  const remaining: Coin[] = []
  for (const coin of state.coins) {
    coin.age += dt
    coin.settle = Math.max(0, coin.settle - dt)
    if (coin.age >= COIN_LIFETIME_SECONDS) {
      state.goldExpired += coin.value
      pushEvent(state, { type: 'coinLost', x: coin.x, y: coin.y })
      continue
    }
    if (coin.settle <= 0) {
      const dx = hero.x - coin.x
      const dy = hero.y - coin.y
      const distance = Math.hypot(dx, dy)
      if (distance <= COIN_PICKUP_RADIUS) {
        state.gold += coin.value
        state.goldCollected += coin.value
        pushEvent(state, { type: 'coin', x: coin.x, y: coin.y, value: coin.value })
        continue
      }
      if (distance <= magnet) {
        const step = Math.min(distance, COIN_MAGNET_SPEED * dt)
        coin.x += (dx / distance) * step
        coin.y += (dy / distance) * step
      }
    }
    remaining.push(coin)
  }
  state.coins = remaining
}

// --- Reading the state -----------------------------------------------------

export function nextWave(state: GameState): WaveDef | null {
  return state.waves[state.waveNumber] ?? null
}

export function buildingAtCell(state: GameState, col: number, row: number): Building | null {
  return inBounds(col, row) ? state.buildingAt[cellIndex(col, row)] ?? null : null
}

/** The route walkers would take from each spawn, for the board's path markers. */
export function previewPaths(state: GameState): { points: { x: number; y: number }[]; blocked: boolean }[] {
  return state.spawns.map((spawn) => {
    const spawnIndex = cellIndex(spawn.col, spawn.row)
    const blocked = !Number.isFinite(state.openField[spawnIndex] ?? UNREACHABLE)
    const field = blocked ? state.breachField : state.openField
    const points: { x: number; y: number }[] = [cellCenter(spawn.col, spawn.row)]
    let col = spawn.col
    let row = spawn.row
    for (let guard = 0; guard < COLS * ROWS; guard += 1) {
      const step = bestStep(field, col, row, blocked ? state.rules.breach : state.rules.open)
      if (!step) {
        break
      }
      col = step.col
      row = step.row
      points.push(cellCenter(col, row))
    }

    return { points, blocked }
  })
}

export function computeStars(state: GameState): 1 | 2 | 3 {
  const share = state.lives / state.maxLives
  if (share >= 0.9) {
    return 3
  }

  return share >= 0.5 ? 2 : 1
}

export function buildHudSnapshot(state: GameState): HudSnapshot {
  return {
    gold: state.gold,
    lives: state.lives,
    maxLives: state.maxLives,
    waveNumber: state.waveNumber,
    totalWaves: state.waves.length,
    nextWaveIn: state.nextWaveIn,
    nextWave: nextWave(state),
    enemiesAlive: state.enemies.length,
    coinsOnGround: state.coins.length,
    pathBlocked: state.pathBlocked,
    unlocked: state.unlocked,
    pendingPicks: state.pendingPicks,
    heroSpeedLevel: state.hero.speedLevel,
    heroMagnetLevel: state.hero.magnetLevel,
    plans: state.plans.length,
    buildingCount: state.buildings.length,
    status: state.status,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
