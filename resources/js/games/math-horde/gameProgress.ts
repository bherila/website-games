import { defineGameData, definitionRowKey, gameDataStorage } from '../_shared/gameDataPersistence'
import { isRecord, parseInteger, parseStars } from '../_shared/progressParsers'
import type { SavedLevelResult, SavedProgress } from './gameTypes'
import { MATH_HORDE_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'

export function createInitialProgress(): SavedProgress {
  return { version: 1, unlockedLevel: 1, highScore: 0, stars: {}, results: {} }
}

export const MATH_HORDE_GAME_DATA = defineGameData<SavedProgress>({
  game: 'math-horde',
  localStorageKey: MATH_HORDE_PROGRESS_STORAGE_KEY,
  parse: parseSavedProgress,
  encode: (progress) => [
    {
      scope: 'profile',
      slot: 'default',
      data: { version: 1, unlocked_level: progress.unlockedLevel, high_score: progress.highScore },
    },
    ...Object.entries(progress.results)
      .filter(([level]) => Number(level) >= 1 && Number(level) <= TOTAL_LEVELS)
      .map(([level, result]) => ({
        scope: 'level' as const,
        slot: level,
        data: { version: 1, stars: result.stars, score: result.score, survivors: result.survivors },
      })),
  ],
  decode: (rows) => {
    const profile = rows.get(definitionRowKey('profile', 'default'))
    let unlockedLevel = profile?.data.version === 1 ? parseInteger(profile.data.unlocked_level, 1) ?? 1 : 1
    const highScore = profile?.data.version === 1 ? parseInteger(profile.data.high_score, 0) ?? 0 : 0
    const stars: Record<number, number> = {}
    const results: Record<number, SavedLevelResult> = {}
    let found = profile?.data.version === 1

    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      const row = rows.get(definitionRowKey('level', String(level)))
      if (row?.data.version !== 1) {
        continue
      }
      const rowStars = parseInteger(row.data.stars, 0)
      const score = parseInteger(row.data.score, 0)
      const survivors = parseInteger(row.data.survivors, 0)
      if (rowStars === null || rowStars > 3 || score === null || survivors === null) {
        continue
      }
      found = true
      stars[level] = rowStars
      results[level] = { stars: rowStars, score, survivors }
      unlockedLevel = Math.max(unlockedLevel, Math.min(TOTAL_LEVELS, level + 1))
    }

    return found ? parseSavedProgress({ version: 1, unlockedLevel, highScore, stars, results }) : null
  },
})

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): SavedProgress {
  try {
    const raw = storage?.getItem(MATH_HORDE_PROGRESS_STORAGE_KEY)

    return raw ? parseSavedProgress(JSON.parse(raw)) ?? createInitialProgress() : createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

export function saveProgress(progress: SavedProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  try {
    storage?.setItem(MATH_HORDE_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Persistence loss must not interrupt a completed level.
  }
}

export function recordWin(progress: SavedProgress, level: number, stars: number, score: number, survivors: number): SavedProgress {
  const previous = progress.results[level]
  const result = {
    stars: Math.max(previous?.stars ?? 0, stars),
    score: Math.max(previous?.score ?? 0, score),
    survivors: Math.max(previous?.survivors ?? 0, survivors),
  }

  return {
    version: 1,
    unlockedLevel: Math.min(TOTAL_LEVELS, Math.max(progress.unlockedLevel, level + 1)),
    highScore: Math.max(progress.highScore, score),
    stars: { ...progress.stars, [level]: result.stars },
    results: { ...progress.results, [level]: result },
  }
}

export function parseSavedProgress(value: unknown): SavedProgress | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }
  const unlockedLevel = parseInteger(value.unlockedLevel, 1)
  const highScore = parseInteger(value.highScore, 0)
  const stars = parseStars(value.stars)
  if (unlockedLevel === null || highScore === null || stars === null || !isRecord(value.results)) {
    return null
  }
  const results: Record<number, SavedLevelResult> = {}
  for (const [level, candidate] of Object.entries(value.results)) {
    const levelId = Number(level)
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > TOTAL_LEVELS || !isRecord(candidate)) {
      continue
    }
    const resultStars = parseInteger(candidate.stars, 0)
    const score = parseInteger(candidate.score, 0)
    const survivors = parseInteger(candidate.survivors, 0)
    if (resultStars === null || resultStars > 3 || score === null || survivors === null) {
      continue
    }
    results[levelId] = { stars: resultStars, score, survivors }
  }

  return {
    version: 1,
    unlockedLevel: Math.min(TOTAL_LEVELS, unlockedLevel),
    highScore,
    stars,
    results,
  }
}
