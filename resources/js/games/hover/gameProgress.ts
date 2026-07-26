import {
  defineGameData,
  definitionRowKey,
  gameDataStorage,
} from '../_shared/gameDataPersistence'
import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { isRecord, parseInteger, safeLocalStorage } from '../_shared/progressParsers'
import { HOVER_PROGRESS_STORAGE_KEY, HOVER_SETTINGS_STORAGE_KEY } from './gameTypes'
import { MAPS, TOTAL_LEVELS } from './maps/maps'
import type { MapId } from './maps/mapTypes'

export const MAP_ORDER: readonly MapId[] = MAPS.map((map) => map.id)

export interface SavedHoverProgress {
  version: 1
  bestScore: number
  /** Furthest round ever reached, 0-based (round = one map attempt). */
  bestRoundIndex: number
  /** Highest clear-count milestone observed per map; concurrent sessions reconcile by maximum. */
  mapsCleared: Record<MapId, number>
}

export interface HoverSettings {
  version: 1
  muted: boolean
}

function emptyMapsCleared(): Record<MapId, number> {
  const cleared = {} as Record<MapId, number>
  for (const mapId of MAP_ORDER) {
    cleared[mapId] = 0
  }
  return cleared
}

export function freshProgress(): SavedHoverProgress {
  return {
    version: 1,
    bestScore: 0,
    bestRoundIndex: 0,
    mapsCleared: emptyMapsCleared(),
  }
}

export const HOVER_GAME_DATA = defineGameData<SavedHoverProgress>({
  game: 'hover',
  localStorageKey: HOVER_PROGRESS_STORAGE_KEY,
  parse: parseSavedProgress,
  encode: (progress) => [
    {
      scope: 'profile',
      slot: 'default',
      data: {
        version: 1,
        best_score: progress.bestScore,
        best_round_index: progress.bestRoundIndex,
      },
    },
    ...MAP_ORDER.map((mapId) => ({
      scope: 'level' as const,
      slot: mapId,
      data: { version: 1, map: mapId, clears: progress.mapsCleared[mapId] },
    })),
  ],
  decode: (rows) => {
    const profileRow = rows.get(definitionRowKey('profile', 'default'))
    const profile = profileRow?.data.version === 1 ? profileRow : undefined
    const bestScore = parseInteger(profile?.data.best_score, 0) ?? 0
    let bestRoundIndex = parseInteger(profile?.data.best_round_index, 0) ?? 0
    const mapsCleared = emptyMapsCleared()
    let found = Boolean(profile)

    MAP_ORDER.forEach((mapId, index) => {
      const row = rows.get(definitionRowKey('level', mapId))
      if (row?.data.version !== 1 || row.data.map !== mapId) {
        return
      }

      const clears = parseInteger(row.data.clears, 0)
      if (clears === null) {
        return
      }

      found = true
      mapsCleared[mapId] = clears
      if (mapsCleared[mapId] > 0) {
        bestRoundIndex = Math.max(bestRoundIndex, index + 1)
      }
    })

    return found ? parseSavedProgress({ version: 1, bestScore, bestRoundIndex, mapsCleared }) : null
  },
})

export function parseSavedProgress(value: unknown): SavedHoverProgress | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.mapsCleared)) {
    return null
  }

  const bestScore = parseInteger(value.bestScore, 0)
  const bestRoundIndex = parseInteger(value.bestRoundIndex, 0)
  if (bestScore === null || bestRoundIndex === null) {
    return null
  }

  const mapsCleared = emptyMapsCleared()
  let knownMaps = 0
  for (const mapId of MAP_ORDER) {
    const raw = value.mapsCleared[mapId]
    // Saves written before a map shipped have no entry for it — that's 0
    // cleared, not a corrupt save. Only reject values that are present but
    // malformed, so expanding the map roster never wipes progress.
    if (raw === undefined) {
      continue
    }
    const cleared = parseInteger(raw, 0)
    if (cleared === null) {
      return null
    }
    mapsCleared[mapId] = cleared
    knownMaps += 1
  }

  // A legacy save's bestRoundIndex counted laps of a smaller roster (an old
  // 3-map save with bestRoundIndex 6 was castle on cycle 3, not "reached map
  // 7") — clamp it to the roster that save knew, so newly shipped maps start
  // locked. Current-roster saves (all keys present) pass through untouched.
  const migratedBestRoundIndex = knownMaps < MAP_ORDER.length ? Math.min(bestRoundIndex, knownMaps) : bestRoundIndex

  return { version: 1, bestScore, bestRoundIndex: migratedBestRoundIndex, mapsCleared }
}

export function loadSavedProgress(): SavedHoverProgress {
  const storage = gameDataStorage()
  if (!storage) {
    return freshProgress()
  }

  try {
    const raw = storage.getItem(HOVER_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return freshProgress()
    }
    return parseSavedProgress(JSON.parse(raw)) ?? freshProgress()
  } catch {
    return freshProgress()
  }
}

export function saveProgress(progress: SavedHoverProgress): void {
  const storage = gameDataStorage()
  try {
    storage?.setItem(HOVER_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage full or unavailable — progress is a nice-to-have, never fatal.
  }
}

export function loadSettings(): HoverSettings {
  const storage = safeLocalStorage()
  if (!storage) {
    return { version: 1, muted: false }
  }

  try {
    const raw = storage.getItem(HOVER_SETTINGS_STORAGE_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (isRecord(value) && value.version === 1 && typeof value.muted === 'boolean') {
      return { version: 1, muted: value.muted }
    }
  } catch {
    // fall through to defaults
  }
  return { version: 1, muted: false }
}

export function saveSettings(settings: HoverSettings): void {
  const storage = safeLocalStorage()
  try {
    storage?.setItem(HOVER_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore — same rationale as saveProgress
  }
}

/**
 * Catalog adapter: Hover is endless, so the Game Select card treats its maps
 * as "levels" — a map unlocks once ever reached, and its stars grow
 * with repeat clears (capped at 3).
 */
export function loadProgress(): LevelSelectProgress {
  const saved = loadSavedProgress()
  const unlockedLevel = Math.min(TOTAL_LEVELS, saved.bestRoundIndex + 1)

  const stars: Record<number, number> = {}
  MAP_ORDER.forEach((mapId, index) => {
    const cleared = saved.mapsCleared[mapId]
    if (cleared > 0) {
      stars[index + 1] = Math.min(3, cleared)
    }
  })

  return { unlockedLevel, stars }
}
