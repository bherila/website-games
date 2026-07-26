import type { ReactElement } from 'react'

import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import type { SavedProgress } from './gameTypes'
import type { LevelDef } from './levels/levelTypes'

interface LevelSelectProps {
  levels: readonly LevelDef[]
  progress: SavedProgress
  onSelectLevel: (levelId: number) => void
}

export function LevelSelect({ levels, progress, onSelectLevel }: LevelSelectProps): ReactElement {
  return (
    <LevelSelectGrid
      emoji="🎪"
      exitHref="/"
      levelIds={levels.map((level) => level.id)}
      progress={progress}
      title="Block Blaster"
      onSelectLevel={onSelectLevel}
    />
  )
}
