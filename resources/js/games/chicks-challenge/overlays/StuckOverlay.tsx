import { Grid3x3, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'

interface StuckOverlayProps {
  onRestart: () => void
  onMenu: () => void
}

/**
 * Shown when the runtime solver probe (`input/useStuckProbe.ts`) proves the
 * current position unsolvable — a self-inflicted dead end (e.g. a block
 * pushed into a corner). Mirrors `DeathOverlay`'s layout/styling.
 */
export function StuckOverlay({ onRestart, onMenu }: StuckOverlayProps): ReactElement {
  return (
    <div
      aria-label="No way to finish"
      className="pointer-events-auto absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-slate-950/50 backdrop-blur-[2px]"
      role="dialog"
    >
      {/* m-auto + min-h-full on the child (never items-center on the scroll
          container, per games/_shared/LevelSelectGrid.tsx) so a dialog taller
          than the overlay scrolls from its own top instead of clipping it. */}
      <div
        className="m-auto flex min-h-full w-fit flex-col items-center justify-center gap-6 p-4"
        data-testid="stuck-dialog"
      >
        <span aria-hidden="true" className="text-5xl">🧱</span>
        <p className="text-sm font-semibold text-white/90">No way to finish</p>

        <div className="flex items-center gap-4">
          <button
            aria-label="Restart level"
            className="flex size-14 animate-pulse items-center justify-center rounded-full bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-xl transition-transform active:scale-95"
            type="button"
            onClick={onRestart}
          >
            <RotateCcw aria-hidden="true" className="size-6" />
          </button>
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
  )
}
