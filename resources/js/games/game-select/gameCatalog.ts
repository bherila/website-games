import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { loadScoreSummary as loadTwenty48Summary } from '../2048/gameProgress'
import { BOARD_SIZES as TWENTY48_BOARD_SIZES } from '../2048/gameTypes'
import { loadProgress as loadBlockBlasterProgress } from '../block-blaster/gameProgress'
import { TOTAL_LEVELS as BLOCK_BLASTER_TOTAL_LEVELS } from '../block-blaster/gameTypes'
import { loadProgress as loadCarsProgress } from '../cars/gameProgress'
import { TOTAL_LEVELS as CARS_TOTAL_LEVELS } from '../cars/levels/levels'
import { loadProgress as loadChicksProgress } from '../chicks-challenge/gameProgress'
import { TOTAL_LEVELS as CHICKS_TOTAL_LEVELS } from '../chicks-challenge/gameTypes'
import { loadProgress as loadHoverProgress } from '../hover/gameProgress'
import { TOTAL_LEVELS as HOVER_TOTAL_LEVELS } from '../hover/maps/maps'
import { loadProgress as loadMarbleSortProgress } from '../marble-sort/gameProgress'
import { TOTAL_LEVELS as MARBLE_SORT_TOTAL_LEVELS } from '../marble-sort/levels'
import { loadProgress as loadMathHordeProgress } from '../math-horde/gameProgress'
import { TOTAL_LEVELS as MATH_HORDE_TOTAL_LEVELS } from '../math-horde/gameTypes'
import { loadProgress as loadTowerProgress } from '../tower-throwback/gameProgress'
import { TOTAL_MILESTONES as TOWER_TOTAL_LEVELS } from '../tower-throwback/gameTypes'

export const GAME_SELECT_PATH = '/'

interface GameCatalogEntryBase {
  slug: string
  title: string
  emoji: string
  description: string
  href: string
}

/** A campaign game: the card reports cleared levels and earned stars. */
export interface LevelGameCatalogEntry extends GameCatalogEntryBase {
  kind: 'levels'
  totalLevels: number
  loadProgress: () => LevelSelectProgress
}

/**
 * An endless, score-driven game with no level campaign: the card reports a short
 * list of label/value stats instead of levels and stars.
 */
export interface ScoreGameCatalogEntry extends GameCatalogEntryBase {
  kind: 'score'
  loadSummary: () => GameScoreSummary
}

export type GameCatalogEntry = LevelGameCatalogEntry | ScoreGameCatalogEntry

export interface GameProgressSummary {
  kind: 'levels'
  started: boolean
  levelsCleared: number
  starsEarned: number
  totalLevels: number
  totalStars: number
}

export interface GameSummaryStat {
  label: string
  value: string
}

export interface GameScoreSummary {
  kind: 'score'
  started: boolean
  /** Shown instead of the stats for a player who hasn't started yet. */
  emptyLabel: string
  stats: readonly GameSummaryStat[]
}

export type GameCardSummary = GameProgressSummary | GameScoreSummary

export const GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    kind: 'levels',
    slug: 'math-horde',
    title: 'Math Horde',
    emoji: '🤖',
    description: 'Break math gates, multiply your neon army, and blast through enemy hordes and bosses.',
    href: '/math-horde',
    totalLevels: MATH_HORDE_TOTAL_LEVELS,
    loadProgress: () => loadMathHordeProgress(),
  },
  {
    kind: 'levels',
    slug: 'parking-pickup',
    title: 'Parking Pickup',
    emoji: '🚗',
    description: 'Park color-matched cars and board the passenger queue before the lot overflows.',
    href: '/parking-pickup',
    totalLevels: CARS_TOTAL_LEVELS,
    loadProgress: () => loadCarsProgress(),
  },
  {
    kind: 'levels',
    slug: 'marble-sort',
    title: 'Marble Sort',
    emoji: '🎱',
    description: 'Pop crates onto the conveyor and sort marbles into matching blocks before the belt fills up.',
    href: '/marble-sort',
    totalLevels: MARBLE_SORT_TOTAL_LEVELS,
    loadProgress: () => loadMarbleSortProgress(),
  },
  {
    kind: 'levels',
    slug: 'block-blaster',
    title: 'Block Blaster',
    emoji: '🎪',
    description: 'Aim the cannon and clear every block tower with a limited supply of balls.',
    href: '/block-blaster',
    totalLevels: BLOCK_BLASTER_TOTAL_LEVELS,
    loadProgress: () => loadBlockBlasterProgress(),
  },
  {
    kind: 'levels',
    slug: 'hover',
    title: 'Hover',
    emoji: '🛸',
    description: 'Race a rival drone through neon mazes in first-person hovercraft capture-the-flag.',
    href: '/hover',
    totalLevels: HOVER_TOTAL_LEVELS,
    loadProgress: () => loadHoverProgress(),
  },
  {
    kind: 'levels',
    slug: 'chicks-challenge',
    title: "Chick's Challenge",
    emoji: '🐥',
    description: 'Guide the chick to every chip through keys, boots, ice, and monsters in a step-based tile puzzler.',
    href: '/chicks-challenge',
    totalLevels: CHICKS_TOTAL_LEVELS,
    loadProgress: () => loadChicksProgress(),
  },
  {
    kind: 'levels',
    slug: 'tower-throwback',
    title: 'Tower Throwback',
    emoji: '🏙️',
    description: 'Grow an empty lot into a 100-story skyscraper — a SimTower throwback with elevators, tenants, and a living economy.',
    href: '/tower-throwback',
    totalLevels: TOWER_TOTAL_LEVELS,
    loadProgress: () => loadTowerProgress(),
  },
  {
    kind: 'score',
    slug: '2048',
    title: '2048',
    emoji: '🔢',
    description: 'Swipe to slide and merge numbered tiles into 2048 — with undo, four board sizes, and no level to finish.',
    href: '/2048',
    loadSummary: () => summarizeTwenty48(),
  },
]

/** Builds the card summary for either catalog variant. */
export function summarizeEntry(entry: GameCatalogEntry): GameCardSummary {
  return entry.kind === 'score'
    ? entry.loadSummary()
    : summarizeProgress(entry.loadProgress(), entry.totalLevels)
}

/**
 * Collapses per-level star records into card-level totals; star entries above
 * the current level count are ignored so a shrunken campaign can't overflow.
 */
export function summarizeProgress(progress: LevelSelectProgress, totalLevels: number): GameProgressSummary {
  let levelsCleared = 0
  let starsEarned = 0

  for (const [levelId, stars] of Object.entries(progress.stars)) {
    if (Number(levelId) > totalLevels) {
      continue
    }

    levelsCleared += 1
    starsEarned += Math.min(3, Math.max(0, stars))
  }

  return {
    kind: 'levels',
    started: levelsCleared > 0,
    levelsCleared,
    starsEarned,
    totalLevels,
    totalStars: totalLevels * 3,
  }
}

function summarizeTwenty48(): GameScoreSummary {
  const summary = loadTwenty48Summary()

  return {
    kind: 'score',
    started: summary.gamesPlayed > 0 || summary.bestScore > 0,
    emptyLabel: `${TWENTY48_BOARD_SIZES.length} board sizes · not played yet`,
    stats: [
      { label: 'Best', value: summary.bestScore.toLocaleString() },
      { label: 'Highest tile', value: summary.highestTile.toLocaleString() },
      { label: 'Games played', value: summary.gamesPlayed.toLocaleString() },
    ],
  }
}
