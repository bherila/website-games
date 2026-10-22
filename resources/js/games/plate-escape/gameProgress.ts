import { defineLevelStarsProgress } from '../_shared/levelStarsProgress'

const progress = defineLevelStarsProgress({
  game: 'plate-escape', storageKey: 'bwh.plate-escape.progress.v1', totalLevels: 1,
})
export const PLATE_ESCAPE_GAME_DATA = progress.gameData
export const { loadProgress, saveProgress, recordWin } = progress
