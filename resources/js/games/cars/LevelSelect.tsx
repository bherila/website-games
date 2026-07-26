import type { ReactElement } from 'react'

import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import type { SavedGameProgress } from './gameTypes'
import type { LevelDef } from './levels/levelTypes'

interface LevelSelectProps {
  levels: readonly LevelDef[]
  progress: SavedGameProgress
  onSelectLevel: (levelId: number) => void
}

export function LevelSelect({ levels, progress, onSelectLevel }: LevelSelectProps): ReactElement {
  return (
    <LevelSelectGrid
      emoji="🚗"
      exitHref="/"
      footer="More levels coming soon."
      levelIds={levels.map((level) => level.id)}
      progress={progress}
      title="Parking Pickup"
      onSelectLevel={onSelectLevel}
    />
  )
}
