import type { ReactElement } from 'react'

import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import type { LevelStarsProgress } from '../_shared/levelStarsProgress'
import type { LevelDef } from './levels/levelTypes'

interface LevelSelectProps {
  levels: readonly LevelDef[]
  progress: LevelStarsProgress
  onSelectLevel: (levelId: number) => void
}

export function LevelSelect({ levels, progress, onSelectLevel }: LevelSelectProps): ReactElement {
  return (
    <LevelSelectGrid
      emoji="🎢"
      exitHref="/"
      footer="Build a run, press Go, and land the marble in the basket."
      levelIds={levels.map((level) => level.id)}
      progress={progress}
      title="Marble Works"
      onSelectLevel={onSelectLevel}
    />
  )
}
