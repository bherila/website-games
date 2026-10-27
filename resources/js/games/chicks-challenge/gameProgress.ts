import {
  defineGameData,
  definitionRowKey,
  gameDataStorage,
} from '../_shared/gameDataPersistence'
import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { isRecord, parseInteger, parseStars } from '../_shared/progressParsers'
import { PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'
import { LEVEL_LAYOUT_REVISIONS } from './levelLayoutRevisions'

export interface SavedChicksProgress {
  version: 1
  unlockedLevel: number
  stars: Record<number, number>
  bestMoves: Record<number, number>
  /** Missing revisions belong to the original layouts (revision 1). */
  layoutRevisions?: Record<number, number>
}

export function defaultProgress(): SavedChicksProgress {
  return { version: 1, unlockedLevel: 1, stars: {}, bestMoves: {}, layoutRevisions: {} }
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
    const layoutRevisions: Record<number, number> = {}
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
        layoutRevisions[level] = row.data.layout_revision === undefined ? 1 : parseInteger(row.data.layout_revision, 1) ?? 0
      }
      unlockedLevel = Math.max(unlockedLevel, Math.min(level + 1, TOTAL_LEVELS))
    }

    return found ? parseSavedProgress({ version: 1, unlockedLevel, stars, bestMoves, layoutRevisions }) : null
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
 * lowest winning move count within the current layout. Obsolete bests reset.
 */
export function recordWin(progress: SavedChicksProgress, levelId: number, moves: number, stars: number): SavedChicksProgress {
  const current = parseSavedProgress(progress) ?? defaultProgress()
  return {
    version: 1,
    unlockedLevel: Math.max(current.unlockedLevel, Math.min(levelId + 1, TOTAL_LEVELS)),
    stars: { ...current.stars, [levelId]: Math.max(current.stars[levelId] ?? 0, stars) },
    bestMoves: { ...current.bestMoves, [levelId]: Math.min(current.bestMoves[levelId] ?? Number.POSITIVE_INFINITY, moves) },
    layoutRevisions: { ...current.layoutRevisions, [levelId]: LEVEL_LAYOUT_REVISIONS[levelId] ?? 1 },
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
  const savedBests = parseBestMoves(value.bestMoves)
  if (unlockedLevel === null || stars === null || savedBests === null) {
    return null
  }

  const bestMoves: Record<number, number> = {}
  const layoutRevisions: Record<number, number> = {}
  const revisions = isRecord(value.layoutRevisions) ? value.layoutRevisions : {}
  for (const [key, moves] of Object.entries(savedBests)) {
    const level = Number(key)
    const revision = revisions[key] === undefined ? 1 : parseInteger(revisions[key], 1)
    if (revision === (LEVEL_LAYOUT_REVISIONS[level] ?? 1)) {
      bestMoves[level] = moves
      layoutRevisions[level] = revision
    }
  }

  return {
    version: 1,
    unlockedLevel: Math.min(Math.max(unlockedLevel, highestWonLevel(stars) + 1), TOTAL_LEVELS),
    stars,
    bestMoves,
    layoutRevisions,
  }
}

/**
 * The highest level id with a recorded win (0 when none). The unlock is capped at
 * TOTAL_LEVELS when it is saved, so a save that finished the old last level holds
 * `unlockedLevel === <old total>`; deriving the unlock from wins as well means a
 * pack that grows (40 -> 45) opens its first new level for those players.
 */
function highestWonLevel(stars: Record<number, number>): number {
  let highest = 0
  for (const [key, value] of Object.entries(stars)) {
    const levelId = Number(key)
    if (value > 0 && levelId > highest) {
      highest = levelId
    }
  }

  return highest
}

function encodeProgress(progress: SavedChicksProgress) {
  // Legacy callers must not stamp an old best as belonging to today's layout.
  progress = parseSavedProgress(progress) ?? defaultProgress()
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
          layout_revision: LEVEL_LAYOUT_REVISIONS[level] ?? 1,
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
