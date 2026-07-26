import { ArrowRight, Grid3x3, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'

import { StarRow } from '../../_shared/StarRow'

interface LevelCompleteOverlayProps {
  stars: number
  moves: number
  par: number
  bestMoves: number
  isNewBest: boolean
  hasNextLevel: boolean
  onReplay: () => void
  onNext: () => void
  onMenu: () => void
}

/** Win overlay: earned stars, moves/par, an improved-best line, and replay/next/menu. */
export function LevelCompleteOverlay({
  stars,
  moves,
  par,
  bestMoves,
  isNewBest,
  hasNextLevel,
  onReplay,
  onNext,
  onMenu,
}: LevelCompleteOverlayProps): ReactElement {
  return (
    <div
      aria-label="Level complete"
      className="pointer-events-auto absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-slate-950/40 backdrop-blur-[2px]"
      role="dialog"
    >
      <style>{`
        @keyframes chips-star-row-enter {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        .chips-star-row {
          animation: chips-star-row-enter 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .chips-star-row { animation: none; }
        }
      `}
      </style>

      {/* m-auto + min-h-full on the child (never items-center on the scroll
          container, per games/_shared/LevelSelectGrid.tsx): a dialog taller than
          the overlay then scrolls from its own top instead of putting the star
          row above the scroll origin where it cannot be reached. The padding
          lives here too, so min-h-full does not force a permanent scroll. */}
      <div className="m-auto flex min-h-full w-fit flex-col items-center justify-center p-4" data-testid="win-dialog">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/95 px-6 py-5 shadow-xl sm:px-8 sm:py-6 dark:bg-slate-900/95">
          <div className="chips-star-row">
            <StarRow stars={stars} />
          </div>

          <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {moves} / {par} moves
          </p>

          {isNewBest && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">New best: {bestMoves} moves!</p>
          )}

          <div className="flex items-center gap-4">
            <button
              aria-label="Replay level"
              className="flex size-14 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-xl transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100"
              type="button"
              onClick={onReplay}
            >
              <RotateCcw aria-hidden="true" className="size-6" />
            </button>

            {hasNextLevel && (
              <button
                aria-label="Next level"
                className="flex size-14 animate-pulse items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-xl transition-transform active:scale-95"
                type="button"
                onClick={onNext}
              >
                <ArrowRight aria-hidden="true" className="size-6" />
              </button>
            )}

            <button
              aria-label="Level select"
              className="flex size-14 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-xl transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100"
              type="button"
              onClick={onMenu}
            >
              <Grid3x3 aria-hidden="true" className="size-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
