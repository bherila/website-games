import { defineLevelStarsProgress } from '../_shared/levelStarsProgress'
import { TOWER_DEFENSE_PROGRESS_STORAGE_KEY } from './gameTypes'
import { TOTAL_LEVELS } from './levels'

const progress = defineLevelStarsProgress({
  game: 'tower-defense',
  storageKey: TOWER_DEFENSE_PROGRESS_STORAGE_KEY,
  totalLevels: TOTAL_LEVELS,
})

export const TOWER_DEFENSE_GAME_DATA = progress.gameData
export const { createInitialProgress, loadProgress, saveProgress, recordWin } = progress
