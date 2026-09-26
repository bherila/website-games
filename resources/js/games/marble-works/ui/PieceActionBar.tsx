import { FlipHorizontal2, RotateCw, Trash2 } from 'lucide-react'
import { type ReactElement, useLayoutEffect, useRef, useState } from 'react'

/** Width assumed before the bar has been measured (three 44 px buttons plus padding). */
const FALLBACK_BAR_WIDTH = 152
const EDGE_MARGIN = 8

/**
 * Keeps a bar centred on `x` fully inside `[margin, containerWidth - margin]`. When the
 * container is narrower than the bar, it is centred in the container instead.
 */
export function clampToolbarX(x: number, barWidth: number, containerWidth: number, margin = EDGE_MARGIN): number {
  const half = barWidth / 2
  const min = half + margin
  const max = containerWidth - half - margin
  if (max < min) {
    return containerWidth / 2
  }

  return Math.min(max, Math.max(min, x))
}

interface PieceActionBarProps {
  /** Width of the board area the bar must stay inside (CSS px). */
  containerWidth: number
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
export function PieceActionBar({ containerWidth, x, y, canRotate, canFlip, onRotate, onFlip, onRemove }: PieceActionBarProps): ReactElement {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [barWidth, setBarWidth] = useState(FALLBACK_BAR_WIDTH)

  useLayoutEffect(() => {
    const measured = barRef.current?.offsetWidth ?? 0
    if (measured > 0 && measured !== barWidth) {
      setBarWidth(measured)
    }
  }, [barWidth, canFlip, canRotate])

  const left = containerWidth > 0 ? clampToolbarX(x, barWidth, containerWidth) : x

  return (
    <div
      aria-label="Piece actions"
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-0.5 rounded-2xl border border-white/70 bg-white/95 p-1 shadow-xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95"
      data-testid="piece-action-bar"
      ref={barRef}
      role="toolbar"
      style={{ left, top: Math.max(56, y - 8) }}
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
