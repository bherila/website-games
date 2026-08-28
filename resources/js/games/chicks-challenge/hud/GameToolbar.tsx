import { RotateCw } from 'lucide-react'
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
      <div className="flex items-end gap-2 landscape:flex-col landscape:items-center">
        <button
          aria-label={ORIENTATION_ARIA[orientationPreference]}
          className={cn(
            'flex h-11 min-w-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3',
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
          {ORIENTATION_LABEL[orientationPreference]}
        </button>
        <FullscreenIconButton
          className="h-11 min-w-11 rounded-full border border-white/70 bg-white/90 text-slate-700 shadow-md transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-200"
          iconClassName="size-4"
        />
      </div>

      {showDpad && <TouchDpad onIntent={onIntent} />}
    </div>
  )
}
