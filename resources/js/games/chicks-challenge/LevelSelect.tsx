import type { ReactElement } from 'react'

import { LevelSelectGrid, type LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { GAME_EMOJI, GAME_TITLE, TOTAL_LEVELS } from './gameTypes'

const LEVEL_IDS: readonly number[] = Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1)

interface LevelSelectProps {
  progress: LevelSelectProgress
  onSelectLevel: (levelId: number) => void
}

/** Thin wrapper over the shared campaign grid — see docs/games/chicks-challenge.md "HUD & screens". */
export function LevelSelect({ progress, onSelectLevel }: LevelSelectProps): ReactElement {
  return (
    <LevelSelectGrid
      emoji={GAME_EMOJI}
      exitHref="/"
      levelIds={LEVEL_IDS}
      progress={progress}
      title={GAME_TITLE}
      onSelectLevel={onSelectLevel}
    />
  )
}
