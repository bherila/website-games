import { defineLevelStarsProgress } from '../_shared/levelStarsProgress'
import { MARBLE_WORKS_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'

const progress = defineLevelStarsProgress({
  game: 'marble-works',
  storageKey: MARBLE_WORKS_PROGRESS_STORAGE_KEY,
  totalLevels: TOTAL_LEVELS,
  // The 24-level campaign replaced the original 12 levels; their stars do not carry over.
  campaignRevision: 2,
})

export const MARBLE_WORKS_GAME_DATA = progress.gameData
export const { createInitialProgress, loadProgress, saveProgress, recordWin } = progress
