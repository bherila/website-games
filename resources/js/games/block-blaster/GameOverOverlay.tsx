import { Grid3x3, RotateCcw, StarOff } from 'lucide-react'
import type { ReactElement } from 'react'

interface GameOverOverlayProps {
  onLevelSelect: () => void
  onReplay: () => void
}

export function GameOverOverlay({ onLevelSelect, onReplay }: GameOverOverlayProps): ReactElement {
  return (
    <div
      aria-label="Level failed"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]"
      role="dialog"
    >
      <div className="flex flex-col items-center gap-6">
        <StarOff aria-hidden="true" className="size-14 text-slate-400" />

        <div className="flex items-center gap-4">
          <button
            aria-label="Retry"
            className="flex size-14 animate-pulse items-center justify-center rounded-full bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-xl transition-transform active:scale-95"
            type="button"
            onClick={onReplay}
          >
            <RotateCcw aria-hidden="true" className="size-6" />
          </button>
          <button
            aria-label="Level select"
            className="flex size-14 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-xl transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100"
            type="button"
            onClick={onLevelSelect}
          >
            <Grid3x3 aria-hidden="true" className="size-6" />
          </button>
        </div>
      </div>
    </div>
  )
}
