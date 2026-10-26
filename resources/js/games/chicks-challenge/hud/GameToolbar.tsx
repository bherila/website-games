import { RotateCw, Undo2 } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { FullscreenIconButton } from '../../_shared/FullscreenButton'
import type { MoveIntent } from '../engine/types'
import type { BoardOrientationPreference, BoardQuarterTurns } from '../input/orientation'
import { TouchDpad } from './TouchDpad'

interface GameToolbarProps {
  orientationPreference: BoardOrientationPreference
  quarterTurns: BoardQuarterTurns
  /** True on touch devices while a level is in play — gates the on-screen D-pad. */
  showDpad: boolean
  /** False on levels where waiting can never matter; the pad's centre is then inert. */
  waitEnabled: boolean
  /** True while there is a move (or restart) to take back. */
  canUndo: boolean
  onUndo: () => void
  onCycleOrientation: () => void
  onIntent: (intent: MoveIntent) => void
}

const ORIENTATION_LABEL: Readonly<Record<BoardOrientationPreference, string>> = {
  auto: 'Auto',
  rotated: 'Turned',
  upright: 'Upright',
}

const ORIENTATION_ARIA: Readonly<Record<BoardOrientationPreference, string>> = {
  auto: 'Board rotation: automatic',
  rotated: 'Board rotation: locked turned',
  upright: 'Board rotation: locked upright',
}

/**
 * Bottom toolbar in portrait, right-hand column in landscape (so the D-pad stays
 * under the thumb instead of stranded at the bottom of a wide screen). Holds the
 * board-rotation toggle and, on touch devices, the D-pad. Laid out as a flow
 * sibling of the playfield — never on top of it — with safe-area insets on the
 * edges it actually touches.
 */
export function GameToolbar({
  orientationPreference,
  quarterTurns,
  showDpad,
  waitEnabled,
  canUndo,
  onUndo,
  onCycleOrientation,
  onIntent,
}: GameToolbarProps): ReactElement {
  return (
    <div
      className="z-20 flex shrink-0 items-end justify-between gap-3 select-none
        pt-2 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]
        pl-[max(0.75rem,env(safe-area-inset-left))]
        landscape:h-full landscape:w-auto landscape:flex-col landscape:items-center landscape:justify-between
        landscape:pt-[max(0.5rem,env(safe-area-inset-top))] landscape:pl-2"
      data-testid="chips-toolbar"
    >
      {/* Portrait: undo in the thumb corner under the view controls, leaving the row's width to
          the D-pad. Landscape: one row, since stacked these pushed the pad off a phone's short side. */}
      <div className="flex flex-col-reverse items-start gap-2 landscape:flex-row landscape:items-center">
        {/* The biggest non-pad target: a mis-swipe on a phone should cost one tap, not a restart. */}
        <button
          aria-label="Undo move"
          className={cn(
            'flex size-14 items-center justify-center rounded-full border border-white/70 bg-white/90 landscape:size-11',
            'text-slate-800 shadow-md transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100',
            'dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100',
          )}
          data-testid="undo-button"
          disabled={!canUndo}
          type="button"
          onClick={onUndo}
        >
          <Undo2 aria-hidden="true" className="size-6" />
        </button>
        <div className="flex items-center gap-2">
        <button
          aria-label={ORIENTATION_ARIA[orientationPreference]}
          className={cn(
            'flex h-11 min-w-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 landscape:justify-center landscape:px-0',
            'text-xs font-bold text-slate-700 shadow-md transition-transform active:scale-95',
            'dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-200',
          )}
          data-orientation-preference={orientationPreference}
          data-testid="orientation-toggle"
          type="button"
          onClick={onCycleOrientation}
        >
          {/* The icon leans the way the board is actually turned, either direction. */}
          <RotateCw
            aria-hidden="true"
            className={cn(
              'size-4 transition-transform',
              quarterTurns === 1 && 'rotate-90',
              quarterTurns === 3 && '-rotate-90',
            )}
          />
          <span className="landscape:sr-only">{ORIENTATION_LABEL[orientationPreference]}</span>
        </button>
        <FullscreenIconButton
          className="h-11 min-w-11 rounded-full border border-white/70 bg-white/90 text-slate-700 shadow-md transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-200"
          iconClassName="size-4"
        />
        </div>
      </div>

      {showDpad && <TouchDpad waitEnabled={waitEnabled} onIntent={onIntent} />}
    </div>
  )
}
