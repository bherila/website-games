import { defineLevelStarsProgress, type LevelStarsProgress } from '../_shared/levelStarsProgress'
import { LEVELS } from './level'

const progress = defineLevelStarsProgress({
  game: 'plate-escape', storageKey: 'bwh.plate-escape.progress.v1', totalLevels: LEVELS.length,
})
export const PLATE_ESCAPE_GAME_DATA = progress.gameData
export const { saveProgress, recordWin } = progress

/** Earlier one-level saves have a capped unlock watermark even after a clear. */
export function loadProgress(storage?: Pick<Storage, 'getItem'> | null): LevelStarsProgress {
  const saved = progress.loadProgress(storage)
  const highestCleared = Math.max(0, ...LEVELS.filter((level) => (saved.stars[level.id] ?? 0) > 0).map((level) => level.id))
  return { ...saved, unlockedLevel: Math.max(saved.unlockedLevel, Math.min(LEVELS.length, highestCleared + 1)) }
}
