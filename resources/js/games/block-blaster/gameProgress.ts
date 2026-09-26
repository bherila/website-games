import { defineLevelStarsProgress } from '../_shared/levelStarsProgress'
import { BLOCK_BLASTER_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from './gameTypes'

const progress = defineLevelStarsProgress({
  game: 'block-blaster',
  storageKey: BLOCK_BLASTER_PROGRESS_STORAGE_KEY,
  totalLevels: TOTAL_LEVELS,
})

export const BLOCK_BLASTER_GAME_DATA = progress.gameData
export const { createInitialProgress, loadProgress, saveProgress, parseSavedProgress, recordWin } = progress
