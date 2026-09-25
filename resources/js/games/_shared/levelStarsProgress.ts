import {
  type DatabaseGameSlug,
  defineGameData,
  definitionRowKey,
  type GameDataDefinition,
  gameDataStorage,
} from './gameDataPersistence'
import { isRecord, parseInteger, parseStars } from './progressParsers'

/** Campaign progress for level games that only track an unlock watermark and best stars. */
export interface LevelStarsProgress {
  version: 1
  /** Highest playable level id, 1..totalLevels. */
  unlockedLevel: number
  /** Best stars earned per level id (0-3). */
  stars: Record<number, number>
}

export interface LevelStarsProgressConfig {
  game: DatabaseGameSlug
  storageKey: string
  totalLevels: number
}

export interface LevelStarsProgressApi {
  gameData: GameDataDefinition
  createInitialProgress: () => LevelStarsProgress
  loadProgress: (storage?: Pick<Storage, 'getItem'> | null) => LevelStarsProgress
  saveProgress: (progress: LevelStarsProgress, storage?: Pick<Storage, 'setItem'> | null) => void
  parseSavedProgress: (value: unknown) => LevelStarsProgress | null
  recordWin: (progress: LevelStarsProgress, levelId: number, earnedStars: number) => LevelStarsProgress
}

/**
 * Builds the progress codec shared by star-rated campaigns: a versioned localStorage blob
 * plus the `profile/default {unlocked_level}` + `level/N {stars}` database rows.
 */
export function defineLevelStarsProgress({ game, storageKey, totalLevels }: LevelStarsProgressConfig): LevelStarsProgressApi {
  function createInitialProgress(): LevelStarsProgress {
    return { version: 1, unlockedLevel: 1, stars: {} }
  }

  function parseSavedProgress(value: unknown): LevelStarsProgress | null {
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
      unlockedLevel: Math.min(totalLevels, unlockedLevel),
      stars,
    }
  }

  const gameData = defineGameData<LevelStarsProgress>({
    game,
    localStorageKey: storageKey,
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

          return Number.isInteger(levelId) && levelId >= 1 && levelId <= totalLevels
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

      for (let level = 1; level <= totalLevels; level += 1) {
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
        unlockedLevel = Math.max(unlockedLevel, Math.min(level + 1, totalLevels))
      }

      return found ? parseSavedProgress({ version: 1, unlockedLevel, stars }) : null
    },
  })

  function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): LevelStarsProgress {
    if (!storage) {
      return createInitialProgress()
    }

    try {
      const raw = storage.getItem(storageKey)
      if (!raw) {
        return createInitialProgress()
      }

      return parseSavedProgress(JSON.parse(raw)) ?? createInitialProgress()
    } catch {
      return createInitialProgress()
    }
  }

  function saveProgress(progress: LevelStarsProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
    try {
      storage?.setItem(storageKey, JSON.stringify(progress))
    } catch {
      // Quota exceeded / private-mode setItem throw: losing persistence must not crash a win.
    }
  }

  /**
   * Records a level win. Never lowers a previously earned star count and never lowers the
   * unlocked-level watermark; caps the unlock at `totalLevels`.
   */
  function recordWin(progress: LevelStarsProgress, levelId: number, earnedStars: number): LevelStarsProgress {
    const existingStars = progress.stars[levelId] ?? 0

    return {
      version: 1,
      unlockedLevel: Math.min(totalLevels, Math.max(progress.unlockedLevel, levelId + 1)),
      stars: { ...progress.stars, [levelId]: Math.max(existingStars, earnedStars) },
    }
  }

  return { gameData, createInitialProgress, loadProgress, saveProgress, parseSavedProgress, recordWin }
}
