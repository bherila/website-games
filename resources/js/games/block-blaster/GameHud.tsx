import { Circle, Grid3x3, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'

import { BottomControlButton, GameBottomToolbar } from '../_shared/GameControlPrimitives'

interface GameHudProps {
  ballsRemaining: number
  level: number
  onLevelSelect: () => void
  onRetry: () => void
}

export function GameHud({ ballsRemaining, level, onLevelSelect, onRetry }: GameHudProps): ReactElement {
  return (
    <>
      <div
        aria-label={`Level ${level}`}
        className="pointer-events-none absolute left-3 top-3 z-10 flex items-center justify-center rounded-2xl border border-white/70 bg-white/85 px-3 py-1.5 shadow-lg shadow-slate-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80"
      >
        <span className="text-xl font-black leading-none tabular-nums text-slate-900 dark:text-slate-50">{level}</span>
      </div>

      <div
        aria-label={`Balls remaining ${ballsRemaining}`}
        className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-red-500 to-amber-600 px-3 py-1.5 text-white shadow-lg shadow-red-950/25"
      >
        <Circle aria-hidden="true" className="size-5 fill-slate-900 text-slate-900" />
        <span className="text-2xl font-black leading-none tabular-nums">{ballsRemaining}</span>
      </div>

      <GameBottomToolbar>
        <BottomControlButton disabled={false} icon={<RotateCcw />} label="Retry" variant="ghost" onClick={onRetry} />
        <BottomControlButton disabled={false} icon={<Grid3x3 />} label="Level select" variant="ghost" onClick={onLevelSelect} />
      </GameBottomToolbar>
    </>
  )
}
