import { gameDataStorage } from '../_shared/gameDataPersistence'
import { defineLevelStarsProgress, type LevelStarsProgress } from '../_shared/levelStarsProgress'
import { TOWER_DEFENSE_PROGRESS_STORAGE_KEY } from './gameTypes'
import { TOTAL_LEVELS } from './levels'

const progress = defineLevelStarsProgress({
  game: 'tower-defense',
  storageKey: TOWER_DEFENSE_PROGRESS_STORAGE_KEY,
  totalLevels: TOTAL_LEVELS,
})

export const TOWER_DEFENSE_GAME_DATA = progress.gameData
export const { createInitialProgress, loadProgress, recordWin } = progress

/** A victory must commit its stars before the active run can be discarded. */
export function saveProgress(value: LevelStarsProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(TOWER_DEFENSE_PROGRESS_STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
