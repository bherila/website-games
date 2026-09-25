import { defineLevelStarsProgress } from '../_shared/levelStarsProgress'
import { MARBLE_WORKS_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'

const progress = defineLevelStarsProgress({
  game: 'marble-works',
  storageKey: MARBLE_WORKS_PROGRESS_STORAGE_KEY,
  totalLevels: TOTAL_LEVELS,
})

export const MARBLE_WORKS_GAME_DATA = progress.gameData
export const { createInitialProgress, loadProgress, saveProgress, recordWin } = progress
