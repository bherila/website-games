import { defineLevelStarsProgress, type LevelStarsProgress } from '../_shared/levelStarsProgress'

const progress = defineLevelStarsProgress({
  game: 'plate-escape', storageKey: 'bwh.plate-escape.progress.v1', totalLevels: 2,
})
export const PLATE_ESCAPE_GAME_DATA = progress.gameData
export const { saveProgress, recordWin } = progress

/** Earlier one-level saves have a capped unlock watermark even after a clear. */
export function loadProgress(storage?: Pick<Storage, 'getItem'> | null): LevelStarsProgress {
  const saved = progress.loadProgress(storage)
  return { ...saved, unlockedLevel: Math.max(saved.unlockedLevel, (saved.stars[1] ?? 0) > 0 ? 2 : 1) }
}
