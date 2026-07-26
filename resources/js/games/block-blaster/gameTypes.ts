import { LEVELS } from './levels/levels'
import type { LevelDef, StarThresholds } from './levels/levelTypes'

export const TOTAL_LEVELS = LEVELS.length

export const BLOCK_BLASTER_PROGRESS_STORAGE_KEY = 'bwh.block-blaster.progress.v1'

export type GameStatus = 'select' | 'playing' | 'won' | 'lost'

export interface SavedProgress {
  version: 1
  /** Highest playable level id, 1..TOTAL_LEVELS. */
  unlockedLevel: number
  /** Best stars earned per level id (0-3). */
  stars: Record<number, number>
}

export interface HintScreenPosition {
  x: number
  y: number
}

/**
 * Contract between the React shell (BlockBlasterGame) and the three.js/cannon-es scene
 * (BlockBlasterScene). The shell owns balls/status/progress state; the scene owns the
 * simulation and reports events. Remounting the scene (React `key`) restarts the level.
 */
export interface SceneProps {
  level: LevelDef
  ballsRemaining: number
  status: 'playing' | 'won' | 'lost'
  /** True until the player fires the first shot of a hinted tutorial level. */
  hintVisible: boolean
  onShotFired: () => void
  onBlocksCleared: (cleared: number, total: number) => void
  onWin: () => void
  onLose: () => void
  /** Screen-space position of the hinted block (CSS px within the canvas), null when hidden. */
  onHintPosition?: (position: HintScreenPosition | null) => void
}

export function computeStars(ballsRemaining: number, thresholds: StarThresholds): 1 | 2 | 3 {
  if (ballsRemaining >= thresholds.threeStar) {
    return 3
  }
  if (ballsRemaining >= thresholds.twoStar) {
    return 2
  }
  return 1
}
