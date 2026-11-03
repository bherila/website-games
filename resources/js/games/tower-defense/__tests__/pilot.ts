import { ELEMENT_IDS, ELEMENTS, TOWERS, towerStats, upgradeCost } from '../catalog'
import { buyHeroUpgrade, callNextWave, cellCenter, createGameState, drainEvents, moveHero, orderBuild, orderUpgrade, pickElement, placementProblem, previewPaths, tickGame } from '../gameEngine'
import { type Building, COLS, type ElementId, type Enemy, type GameState, type LevelDef, ROWS, type TowerId } from '../gameTypes'
import { bestStep, cellIndex, computeField, UNREACHABLE } from '../pathfinding'

export const STEP = 1 / 30

/**
 * - `plain` never mazes, and places towers to cover both the walkers' route and the flight line.
 * - `maze-ignoring-flyers` builds wall barriers and only ever aims its towers at the walkers.
 * - `maze-covering-flyers` builds the same barriers and gives every third tower to the flight line.
 */
export type PilotStyle = 'plain' | 'maze-ignoring-flyers' | 'maze-covering-flyers'

export interface PilotOptions {
  /** Seconds between the pilot's decisions; a person is not frame-perfect. */
  thinkSeconds?: number
  /** The order the pilot unlocks elements in. */
  elements?: readonly ElementId[]
  /** Share of coins it bothers to chase, 0..1. */
  coinEffort?: number
  /** Most towers it will stand up, so it has to upgrade like a person would. */
  maxTowers?: number
  callWavesEarly?: boolean
  maxSeconds?: number
  seed?: number
  style?: PilotStyle
}

export interface PilotLeaks {
  flyers: number
  walkers: number
  flyerLives: number
  walkerLives: number
}

export interface PilotResult {
  state: GameState
  seconds: number
  towers: number
  upgrades: number
  leaks: PilotLeaks
  /** The longest walk from a spawn to the keep when the run ended. */
  routeLength: number
  /** Share of the flight line within range of a finished tower that can hit air. */
  flightCoverage: number
}

/**
 * A plain, unclever player that drives only the public commands. By default it puts towers
 * beside the walkers' route, upgrades them, runs after coins, and never mazes. If it can clear
 * a level with room to spare, a person who mazes and matches elements has plenty of headroom.
 * The maze styles measure the other side of that: what a long maze does for walkers and flyers.
 */
export function runPilot(level: LevelDef, options: PilotOptions = {}): PilotResult {
  const { thinkSeconds = 1, elements = ELEMENT_IDS, coinEffort = 1, maxTowers = 20, callWavesEarly = false, maxSeconds = 2400, seed, style = 'plain' } = options
  const state = seed === undefined ? createGameState(level) : createGameState(level, seed)
  let think = 0
  let seconds = 0
  let towers = 0
  let upgrades = 0
  const leaks: PilotLeaks = { flyers: 0, walkers: 0, flyerLives: 0, walkerLives: 0 }
  const maze = style === 'plain' ? null : planMaze(state)
  while (state.status === 'playing' && seconds < maxSeconds) {
    if (state.pendingPicks > 0) {
      const choice = [...elements, ...ELEMENT_IDS].find((element) => !state.unlocked.includes(element))
      if (!choice || !pickElement(state, choice)) {
        throw new Error('the pilot could not choose an element')
      }
    }
    think -= STEP
    if (think <= 0) {
      think = thinkSeconds
      const placed = decide(state, maxTowers, towers, coinEffort, style, maze)
      towers += placed.towers
      upgrades += placed.upgrades
      if (callWavesEarly && state.enemies.length === 0 && state.plans.length === 0) {
        callNextWave(state)
      }
    }
    const present = [...state.enemies]
    tickGame(state, STEP)
    drainEvents(state)
    tallyLeaks(state, present, leaks)
    seconds += STEP
  }

  return { state, seconds, towers, upgrades, leaks, routeLength: longestWalk(state), flightCoverage: flightCoverage(state) }
}

/** An enemy that left the board with health to spare walked or flew into the keep. */
function tallyLeaks(state: GameState, present: readonly Enemy[], leaks: PilotLeaks): void {
  const remaining = new Set(state.enemies)
  for (const enemy of present) {
    if (remaining.has(enemy) || enemy.hp <= 0) {
      continue
    }
    if (enemy.flying) {
      leaks.flyers += 1
      leaks.flyerLives += enemy.lives
    } else {
      leaks.walkers += 1
      leaks.walkerLives += enemy.lives
    }
  }
}

function longestWalk(state: GameState): number {
  const field = computeField(state.exits.map(({ col, row }) => cellIndex(col, row)), state.rules.open)

  return Math.max(...state.spawns.map(({ col, row }) => field[cellIndex(col, row)] ?? UNREACHABLE))
}

function flightLine(state: GameState): { x: number; y: number }[] {
  return state.spawns.flatMap((spawn) => state.exits.flatMap((exit) => Array.from({ length: 16 }, (_, step) => ({
    x: spawn.col + 0.5 + ((exit.col - spawn.col) * step / 15),
    y: spawn.row + 0.5 + ((exit.row - spawn.row) * step / 15),
  }))))
}

function airDefences(state: GameState): Building[] {
  return state.buildings.filter((building) => building.progress >= 1 && TOWERS[building.tower].hitsAir)
}

function reaches(building: Building, point: { x: number; y: number }): boolean {
  const center = cellCenter(building.col, building.row)

  return Math.hypot(point.x - center.x, point.y - center.y) <= towerStats(building.tower, building.tier).range
}

function flightCoverage(state: GameState): number {
  const line = flightLine(state)
  const defences = airDefences(state)

  return line.filter((point) => defences.some((building) => reaches(building, point))).length / line.length
}

function decide(state: GameState, maxTowers: number, towers: number, coinEffort: number, style: PilotStyle, maze: MazePlan | null): { towers: number; upgrades: number } {
  const result = { towers: 0, upgrades: 0 }
  // Chase the nearest coin once the building is done, because jobs wait while the hero runs.
  const coin = state.coins.reduce<{ x: number; y: number } | null>((best, entry) => {
    const distance = Math.hypot(entry.x - state.hero.x, entry.y - state.hero.y)
    const bestDistance = best ? Math.hypot(best.x - state.hero.x, best.y - state.hero.y) : Number.POSITIVE_INFINITY

    return distance < bestDistance ? entry : best
  }, null)
  if (coin && state.plans.length === 0 && state.random() < coinEffort) {
    moveHero(state, coin.x, coin.y)
  }

  if (maze && orderMazeWalls(state, maze, towers)) {
    return result
  }

  const forFlyers = style === 'maze-covering-flyers' && towers % 3 === 2
  const choice = pickTower(state, maze !== null, forFlyers)
  if (towers < maxTowers && state.gold >= TOWERS[choice].costs[0] && state.buildings.filter((building) => building.tower !== 'wall').length <= (state.waveNumber * 2) + 3) {
    const spot = maze ? spotInMaze(state, maze, choice, towers, forFlyers) : spotBesideRoute(state, choice)
    if (spot && orderBuild(state, choice, spot.col, spot.row)) {
      result.towers += 1

      return result
    }
  }
  const upgradable = state.buildings
    .filter((building) => building.progress >= 1 && upgradeCost(building.tower, building.tier) !== null && !state.plans.some((plan) => plan.buildingId === building.id))
    .sort((a, b) => a.tier - b.tier)[0]
  if (upgradable && orderUpgrade(state, upgradable.id)) {
    result.upgrades += 1

    return result
  }
  if (state.gold > 200 && state.hero.speedLevel < 1) {
    buyHeroUpgrade(state, 'boots')
  } else if (state.gold > 200 && state.hero.magnetLevel < 2) {
    buyHeroUpgrade(state, 'magnet')
  }

  return result
}

function pickTower(state: GameState, mazing: boolean, forFlyers: boolean): TowerId {
  // A mazer owns dozens of walls, so only its towers should move the rotation along.
  const choice = bestTowerChoice(state, mazing ? state.buildings.filter((building) => building.tower !== 'wall').length : state.buildings.length)

  return forFlyers && !TOWERS[choice].hitsAir ? 'arrow' : choice
}

function bestTowerChoice(state: GameState, owned: number): TowerId {
  const unlocked = state.unlocked
  if (unlocked.length === 0) {
    return 'arrow'
  }
  // Rotate through what it has, with arrows as the anti-air backbone.
  const pick = unlocked[owned % (unlocked.length + 1)]

  return pick ? ELEMENTS[pick].tower : 'arrow'
}

/** The free cell that covers the most of the route without pushing walkers onto another one. */
function spotBesideRoute(state: GameState, tower: TowerId): { col: number; row: number } | null {
  const paths = previewPaths(state)
  // Flyers head straight for the keep, so that line needs covering too.
  const flight = flightLine(state)
  const range = Math.max(2.5, TOWERS[tower].range)
  const onRoute = new Set(paths.flatMap((path) => path.points.map((point) => `${Math.floor(point.x)},${Math.floor(point.y)}`)))
  const candidates: { col: number; row: number; score: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (onRoute.has(`${col},${row}`) || placementProblem(state, tower, col, row)) {
        continue
      }
      const center = cellCenter(col, row)
      let score = 0
      for (const point of [...paths.flatMap((path) => path.points), ...flight]) {
        if (Math.hypot(point.x - center.x, point.y - center.y) <= range) {
          score += 1
        }
      }
      // Spread out a little so one breach does not take everything.
      score -= state.buildings.filter((building) => Math.hypot(building.col - col, building.row - row) < 1.5).length * 0.5
      candidates.push({ col, row, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  return candidates.slice(0, 12).find((spot) => !changesRoute(state, spot)) ?? candidates[0] ?? null
}

function changesRoute(state: GameState, spot: { col: number; row: number }): boolean {
  const goals = state.exits.map(({ col, row }) => cellIndex(col, row))
  const index = cellIndex(spot.col, spot.row)
  const lengths = (): number[] => {
    const field = computeField(goals, state.rules.open)

    return state.spawns.map(({ col, row }) => field[cellIndex(col, row)] ?? UNREACHABLE)
  }
  const before = lengths()
  // The grid's own rules read this array, so a stand-in shows the route the tower would leave.
  state.buildingAt[index] = state.buildings[0] ?? placeholder
  const after = lengths()
  state.buildingAt[index] = null

  return after.some((length, position) => length !== before[position])
}

const placeholder: Building = { id: 0, tower: 'wall', tier: 1, col: 0, row: 0, hp: 1, maxHp: 1, progress: 1, cooldown: 0, invested: 0, hitAge: 0, aim: 0 }

// --- Mazing ------------------------------------------------------------------

const MAX_BARRIERS = 6
/** Keeps a lane and room for towers between two barriers. */
const BARRIER_SPACING = 4
const MIN_BARRIER_GAIN = 3
const MAX_QUEUED_WALLS = 6

interface Barrier {
  row: number
  fromCol: number
  toCol: number
  cells: readonly number[]
}

interface MazePlan {
  barriers: readonly Barrier[]
  /** Where the walkers will end up walking once every barrier stands. */
  route: readonly { x: number; y: number }[]
  /** Cells that must stay free, so nothing the pilot builds can ever close the route. */
  reserved: ReadonlySet<number>
}

/** Every stretch of buildable cells in a row, walled off whole or leaving a gap at either end. */
function barrierOptions(state: GameState): Barrier[] {
  const options: Barrier[] = []
  for (let row = 2; row < ROWS - 2; row += 1) {
    let col = 0
    while (col < COLS) {
      if (state.terrain[cellIndex(col, row)] !== 'ground') {
        col += 1
        continue
      }
      const fromCol = col
      while (col < COLS && state.terrain[cellIndex(col, row)] === 'ground') {
        col += 1
      }
      const toCol = col - 1
      const cellsBetween = (first: number, last: number): number[] => Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => cellIndex(first + offset, row))
      options.push(
        { row, fromCol, toCol, cells: cellsBetween(fromCol, toCol) },
        { row, fromCol, toCol, cells: cellsBetween(fromCol + 1, toCol) },
        { row, fromCol, toCol, cells: cellsBetween(fromCol, toCol - 1) },
      )
    }
  }

  return options
}

/** Runs `measure` as if `cells` were built on; the grid's own rules read this array. */
function withBuiltCells<T>(state: GameState, cells: readonly number[], measure: () => T): T {
  for (const cell of cells) {
    state.buildingAt[cell] = placeholder
  }
  const result = measure()
  for (const cell of cells) {
    state.buildingAt[cell] = null
  }

  return result
}

/** Greedily picks the barriers that lengthen the walk the most, the way a person lays out a maze. */
function planMaze(state: GameState): MazePlan {
  const goals = state.exits.map(({ col, row }) => cellIndex(col, row))
  const totalWalk = (): number => {
    const field = computeField(goals, state.rules.open)

    return state.spawns.reduce((sum, { col, row }) => sum + (field[cellIndex(col, row)] ?? UNREACHABLE), 0)
  }
  const options = barrierOptions(state)
  const barriers: Barrier[] = []
  const built = (): number[] => barriers.flatMap((barrier) => [...barrier.cells])
  let walk = totalWalk()
  while (barriers.length < MAX_BARRIERS) {
    let best: Barrier | null = null
    let bestWalk = walk + MIN_BARRIER_GAIN
    for (const option of options) {
      const crowded = barriers.some((barrier) => Math.abs(barrier.row - option.row) < BARRIER_SPACING && barrier.fromCol <= option.toCol && option.fromCol <= barrier.toCol)
      if (crowded) {
        continue
      }
      const candidateWalk = withBuiltCells(state, [...built(), ...option.cells], totalWalk)
      if (Number.isFinite(candidateWalk) && candidateWalk > bestWalk) {
        best = option
        bestWalk = candidateWalk
      }
    }
    if (!best) {
      break
    }
    barriers.push(best)
    walk = bestWalk
  }

  return withBuiltCells(state, built(), () => {
    const field = computeField(goals, state.rules.open)
    const route: { x: number; y: number }[] = []
    const reserved = new Set<number>()
    for (const spawn of state.spawns) {
      let { col, row } = spawn
      for (let step = bestStep(field, col, row, state.rules.open); step; step = bestStep(field, col, row, state.rules.open)) {
        reserved.add(cellIndex(step.col, step.row))
        // A diagonal step also needs both cells beside it clear.
        reserved.add(cellIndex(step.col, row))
        reserved.add(cellIndex(col, step.row))
        route.push(cellCenter(step.col, step.row))
        col = step.col
        row = step.row
      }
    }

    return { barriers, route, reserved }
  })
}

/**
 * Raises the first barrier once four towers are earning gold, then one more for every two towers.
 * Walling off the map before anything can kill a walker starves the run of coins.
 */
function orderMazeWalls(state: GameState, maze: MazePlan, towers: number): boolean {
  let ordered = false
  for (const barrier of maze.barriers.slice(0, Math.max(0, Math.floor((towers - 2) / 2)))) {
    for (const cell of barrier.cells) {
      if (state.plans.length >= MAX_QUEUED_WALLS) {
        return ordered
      }
      // This also rebuilds whatever the sappers knocked down.
      if (!maze.reserved.has(cell) && orderBuild(state, 'wall', cell % COLS, Math.floor(cell / COLS))) {
        ordered = true
      }
    }
  }

  return ordered
}

function spotInMaze(state: GameState, maze: MazePlan, tower: TowerId, towers: number, forFlyers: boolean): { col: number; row: number } | null {
  const walking = previewPaths(state).flatMap((path) => path.points)
  const flight = flightLine(state)
  const defences = airDefences(state)
  const range = Math.max(2.5, TOWERS[tower].range)
  let best: { col: number; row: number } | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (maze.reserved.has(cellIndex(col, row)) || placementProblem(state, tower, col, row)) {
        continue
      }
      const center = cellCenter(col, row)
      const inRange = (point: { x: number; y: number }): boolean => Math.hypot(point.x - center.x, point.y - center.y) <= range
      // Where walkers are now pays the bills until the walls go up; then the guns follow the maze.
      const walkers = walking.filter(inRange).length + (maze.route.filter(inRange).length * (towers >= 4 ? 1 : 0.25))
      // A stretch of the flight line nobody guards yet is worth more than one already covered.
      const flyers = forFlyers ? flight.filter(inRange).reduce((sum, point) => sum + (1 / (1 + defences.filter((building) => reaches(building, point)).length)), 0) : 0
      const crowding = state.buildings.filter((building) => building.tower !== 'wall' && Math.hypot(building.col - col, building.row - row) < 1.5).length
      const score = forFlyers ? (flyers * 100) + walkers : walkers - (crowding * 0.5)
      if (score > bestScore) {
        best = { col, row }
        bestScore = score
      }
    }
  }

  return best
}
