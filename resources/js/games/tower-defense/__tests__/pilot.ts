import { ELEMENT_IDS, ELEMENTS, TOWERS, upgradeCost } from '../catalog'
import { buyHeroUpgrade, callNextWave, cellCenter, createGameState, drainEvents, moveHero, orderBuild, orderUpgrade, pickElement, placementProblem, previewPaths, tickGame } from '../gameEngine'
import { type Building, COLS, type ElementId, type GameState, type LevelDef, ROWS, type TowerId } from '../gameTypes'
import { cellIndex, computeField, UNREACHABLE } from '../pathfinding'

export const STEP = 1 / 30

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
}

export interface PilotResult {
  state: GameState
  seconds: number
  towers: number
  upgrades: number
}

/**
 * A plain, unclever player that drives only the public commands. It puts towers beside the
 * walkers' route, upgrades them, runs after coins, and never mazes. If it can clear a level
 * with room to spare, a person who mazes and matches elements has plenty of headroom.
 */
export function runPilot(level: LevelDef, options: PilotOptions = {}): PilotResult {
  const { thinkSeconds = 1, elements = ELEMENT_IDS, coinEffort = 1, maxTowers = 20, callWavesEarly = false, maxSeconds = 2400, seed } = options
  const state = seed === undefined ? createGameState(level) : createGameState(level, seed)
  let think = 0
  let seconds = 0
  let towers = 0
  let upgrades = 0
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
      const placed = decide(state, maxTowers, towers, coinEffort)
      towers += placed.towers
      upgrades += placed.upgrades
      if (callWavesEarly && state.enemies.length === 0 && state.plans.length === 0) {
        callNextWave(state)
      }
    }
    tickGame(state, STEP)
    drainEvents(state)
    seconds += STEP
  }

  return { state, seconds, towers, upgrades }
}

function decide(state: GameState, maxTowers: number, towers: number, coinEffort: number): { towers: number; upgrades: number } {
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

  const choice = bestTowerChoice(state)
  if (towers < maxTowers && state.gold >= TOWERS[choice].costs[0] && state.buildings.filter((building) => building.tower !== 'wall').length <= (state.waveNumber * 2) + 3) {
    const spot = spotBesideRoute(state, choice)
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

function bestTowerChoice(state: GameState): TowerId {
  const unlocked = state.unlocked
  if (unlocked.length === 0) {
    return 'arrow'
  }
  // Rotate through what it has, with arrows as the anti-air backbone.
  const owned = state.buildings.length
  const pick = unlocked[owned % (unlocked.length + 1)]

  return pick ? ELEMENTS[pick].tower : 'arrow'
}

/** The free cell that covers the most of the route without pushing walkers onto another one. */
function spotBesideRoute(state: GameState, tower: TowerId): { col: number; row: number } | null {
  const paths = previewPaths(state)
  // Flyers head straight for the keep, so that line needs covering too.
  const flight = state.spawns.flatMap((spawn) => state.exits.flatMap((exit) => Array.from({ length: 16 }, (_, step) => ({
    x: spawn.col + 0.5 + ((exit.col - spawn.col) * step / 15),
    y: spawn.row + 0.5 + ((exit.row - spawn.row) * step / 15),
  }))))
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
