import {
  defineGameData,
  definitionRowKey,
  gameDataStorage,
} from '../_shared/gameDataPersistence'
import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { isRecord, parseInteger, parseStars } from '../_shared/progressParsers'
import { PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'

export interface SavedChicksProgress {
  version: 1
  unlockedLevel: number
  stars: Record<number, number>
  bestMoves: Record<number, number>
}

export function defaultProgress(): SavedChicksProgress {
  return { version: 1, unlockedLevel: 1, stars: {}, bestMoves: {} }
}

export const CHICKS_GAME_DATA = defineGameData<SavedChicksProgress>({
  game: 'chicks-challenge',
  localStorageKey: PROGRESS_STORAGE_KEY,
  parse: parseSavedProgress,
  encode: encodeProgress,
  decode: (rows) => {
    const profileRow = rows.get(definitionRowKey('profile', 'default'))
    const profile = profileRow?.data.version === 1 ? profileRow : undefined
    let unlockedLevel = parseInteger(profile?.data.unlocked_level, 1) ?? 1
    const stars: Record<number, number> = {}
    const bestMoves: Record<number, number> = {}
    let found = Boolean(profile)

    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      const row = rows.get(definitionRowKey('level', String(level)))
      if (row?.data.version !== 1) {
        continue
      }

      const rowStars = parseInteger(row.data.stars, 0)
      const rowBestMoves = parseInteger(row.data.best_moves, 1)
      if (rowStars === null || rowStars > 3) {
        continue
      }

      found = true
      stars[level] = rowStars
      if (rowBestMoves !== null) {
        bestMoves[level] = rowBestMoves
      }
      unlockedLevel = Math.max(unlockedLevel, Math.min(level + 1, TOTAL_LEVELS))
    }

    return found ? parseSavedProgress({ version: 1, unlockedLevel, stars, bestMoves }) : null
  },
})

export function loadSavedProgress(): SavedChicksProgress {
  const storage = gameDataStorage()
  if (!storage) {
    return defaultProgress()
  }

  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) {
      return defaultProgress()
    }

    return parseSavedProgress(JSON.parse(raw)) ?? defaultProgress()
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(progress: SavedChicksProgress): void {
  const storage = gameDataStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage full/unavailable — progress is best-effort.
  }
}

/**
 * Records a win: unlocks the next level, keeps the best stars, and keeps the
 * lowest winning move count. Never lowers existing bests.
 */
export function recordWin(progress: SavedChicksProgress, levelId: number, moves: number, stars: number): SavedChicksProgress {
  return {
    version: 1,
    unlockedLevel: Math.max(progress.unlockedLevel, Math.min(levelId + 1, TOTAL_LEVELS)),
    stars: { ...progress.stars, [levelId]: Math.max(progress.stars[levelId] ?? 0, stars) },
    bestMoves: { ...progress.bestMoves, [levelId]: Math.min(progress.bestMoves[levelId] ?? Number.POSITIVE_INFINITY, moves) },
  }
}

/** Game Select / level select contract. */
export function loadProgress(): LevelSelectProgress {
  const saved = loadSavedProgress()

  return { unlockedLevel: saved.unlockedLevel, stars: saved.stars }
}

export function parseSavedProgress(value: unknown): SavedChicksProgress | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const unlockedLevel = parseInteger(value.unlockedLevel, 1)
  const stars = parseStars(value.stars)
  const bestMoves = parseBestMoves(value.bestMoves)
  if (unlockedLevel === null || stars === null || bestMoves === null) {
    return null
  }

  return {
    version: 1,
    unlockedLevel: Math.min(unlockedLevel, TOTAL_LEVELS),
    stars,
    bestMoves,
  }
}

function encodeProgress(progress: SavedChicksProgress) {
  const levelIds = new Set([
    ...Object.keys(progress.stars).map(Number),
    ...Object.keys(progress.bestMoves).map(Number),
  ])

  return [
    {
      scope: 'profile' as const,
      slot: 'default',
      data: { version: 1, unlocked_level: progress.unlockedLevel },
    },
    ...[...levelIds]
      .filter((level) => Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS)
      .sort((left, right) => left - right)
      .map((level) => ({
        scope: 'level' as const,
        slot: String(level),
        data: {
          version: 1,
          stars: progress.stars[level] ?? 0,
          ...(progress.bestMoves[level] === undefined ? {} : { best_moves: progress.bestMoves[level] }),
        },
      })),
  ]
}

function parseBestMoves(value: unknown): Record<number, number> | null {
  if (!isRecord(value)) {
    return null
  }

  const bestMoves: Record<number, number> = {}
  for (const [key, entry] of Object.entries(value)) {
    const levelId = parseInteger(Number(key), 1)
    const moves = parseInteger(entry, 1)
    if (levelId === null || moves === null) {
      return null
    }

    bestMoves[levelId] = moves
  }

  return bestMoves
}
