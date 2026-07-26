import {
  defineGameData,
  definitionRowKey,
  gameDataStorage,
} from '../_shared/gameDataPersistence'
import { isRecord, parseInteger, parseStars } from '../_shared/progressParsers'
import { BLOCK_BLASTER_PROGRESS_STORAGE_KEY, type SavedProgress, TOTAL_LEVELS } from './gameTypes'

export function createInitialProgress(): SavedProgress {
  return { version: 1, unlockedLevel: 1, stars: {} }
}

export const BLOCK_BLASTER_GAME_DATA = defineGameData<SavedProgress>({
  game: 'block-blaster',
  localStorageKey: BLOCK_BLASTER_PROGRESS_STORAGE_KEY,
  parse: parseSavedProgress,
  encode: (progress) => [
    {
      scope: 'profile',
      slot: 'default',
      data: { version: 1, unlocked_level: progress.unlockedLevel },
    },
    ...Object.entries(progress.stars)
      .filter(([level]) => {
        const levelId = Number(level)

        return Number.isInteger(levelId) && levelId >= 1 && levelId <= TOTAL_LEVELS
      })
      .map(([level, stars]) => ({
        scope: 'level' as const,
        slot: level,
        data: { version: 1, stars },
      })),
  ],
  decode: (rows) => {
    const profileRow = rows.get(definitionRowKey('profile', 'default'))
    const profile = profileRow?.data.version === 1 ? profileRow : undefined
    let unlockedLevel = parseInteger(profile?.data.unlocked_level, 1) ?? 1
    const stars: Record<number, number> = {}
    let found = Boolean(profile)

    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      const row = rows.get(definitionRowKey('level', String(level)))
      if (row?.data.version !== 1) {
        continue
      }

      const rowStars = parseInteger(row.data.stars, 0)
      if (rowStars === null || rowStars > 3) {
        continue
      }

      found = true
      stars[level] = rowStars
      unlockedLevel = Math.max(unlockedLevel, Math.min(level + 1, TOTAL_LEVELS))
    }

    return found ? parseSavedProgress({ version: 1, unlockedLevel, stars }) : null
  },
})

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): SavedProgress {
  if (!storage) {
    return createInitialProgress()
  }

  try {
    const raw = storage.getItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return createInitialProgress()
    }

    return parseSavedProgress(JSON.parse(raw)) ?? createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

export function saveProgress(progress: SavedProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  try {
    storage?.setItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Quota exceeded / private-mode setItem throw: losing persistence must not crash a win.
  }
}

export function parseSavedProgress(value: unknown): SavedProgress | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const unlockedLevel = parseInteger(value.unlockedLevel, 1)
  const stars = parseStars(value.stars)
  if (unlockedLevel === null || stars === null) {
    return null
  }

  return {
    version: 1,
    unlockedLevel: Math.min(TOTAL_LEVELS, unlockedLevel),
    stars,
  }
}

/**
 * Records a level win. Never lowers a previously earned star count and never lowers the
 * unlocked-level watermark; caps the unlock at `TOTAL_LEVELS`.
 */
export function recordWin(progress: SavedProgress, levelId: number, earnedStars: number): SavedProgress {
  const existingStars = progress.stars[levelId] ?? 0

  return {
    version: 1,
    unlockedLevel: Math.min(TOTAL_LEVELS, Math.max(progress.unlockedLevel, levelId + 1)),
    stars: { ...progress.stars, [levelId]: Math.max(existingStars, earnedStars) },
  }
}
