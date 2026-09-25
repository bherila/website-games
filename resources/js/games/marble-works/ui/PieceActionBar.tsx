import { FlipHorizontal2, RotateCw, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'

interface PieceActionBarProps {
  /** Anchor point (container CSS px): the top-centre of the selected piece. */
  x: number
  y: number
  canRotate: boolean
  canFlip: boolean
  onRotate: () => void
  onFlip: () => void
  onRemove: () => void
}

const BUTTON = 'flex size-11 items-center justify-center rounded-xl text-slate-700 transition-transform hover:bg-slate-100 active:scale-90 dark:text-slate-100 dark:hover:bg-white/10 [&_svg]:size-5'

/** Floating Rotate / Flip / Remove bar anchored above the selected piece. */
export function PieceActionBar({ x, y, canRotate, canFlip, onRotate, onFlip, onRemove }: PieceActionBarProps): ReactElement {
  return (
    <div
      aria-label="Piece actions"
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-0.5 rounded-2xl border border-white/70 bg-white/95 p-1 shadow-xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95"
      data-testid="piece-action-bar"
      role="toolbar"
      style={{ left: x, top: Math.max(56, y - 8) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canRotate && (
        <button aria-label="Rotate piece" className={BUTTON} type="button" onClick={onRotate}>
          <RotateCw aria-hidden="true" />
        </button>
      )}
      {canFlip && (
        <button aria-label="Flip piece" className={BUTTON} type="button" onClick={onFlip}>
          <FlipHorizontal2 aria-hidden="true" />
        </button>
      )}
      <button aria-label="Remove piece" className={`${BUTTON} text-rose-600 dark:text-rose-400`} type="button" onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  )
}
