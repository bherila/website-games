import { ArrowLeftRight, RotateCw, Trash2 } from 'lucide-react'
import { type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type PieceId, PIECES } from '../pieces/pieceCatalog'
import { PieceIcon } from './PieceIcon'

/** Size assumed before the bar has been measured (three 52 px buttons plus padding). */
const FALLBACK_BAR_WIDTH = 168
const FALLBACK_BAR_HEIGHT = 62
const EDGE_MARGIN = 8
/** Gap between the bar and the piece it belongs to. */
const PIECE_GAP = 8
/** The HUD pills occupy the top of the board area; the bar never goes above this. */
export const TOOLBAR_TOP_LIMIT = 56

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

/**
 * Top edge for a bar of `barHeight`: above the piece (whose top and bottom edges are
 * `pieceTop` / `pieceBottom`) when it fits below the HUD, otherwise just under the piece, so
 * the bar never hides the piece it edits. Kept inside the container either way.
 */
export function placeToolbarY(pieceTop: number, pieceBottom: number, barHeight: number, containerHeight: number, topLimit = TOOLBAR_TOP_LIMIT): number {
  const above = pieceTop - PIECE_GAP - barHeight
  if (above >= topLimit) {
    return above
  }
  const below = pieceBottom + PIECE_GAP

  return Math.max(topLimit, Math.min(below, containerHeight - barHeight - EDGE_MARGIN))
}

interface PieceActionBarProps {
  pieceId: PieceId
  variant: number
  flipped: boolean
  /** Size of the board area the bar must stay inside (CSS px). */
  containerWidth: number
  containerHeight: number
  /** Horizontal centre and top / bottom edges of the selected piece (container CSS px). */
  x: number
  pieceTop: number
  pieceBottom: number
  canRotate: boolean
  canFlip: boolean
  /** Whether the rotated / flipped piece would still fit where it is. */
  rotateFits: boolean
  flipFits: boolean
  onRotate: () => void
  onFlip: () => void
  onRemove: () => void
}

const BUTTON = 'flex w-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1.5 text-slate-700 transition-transform hover:bg-slate-100 active:scale-90 disabled:opacity-35 disabled:hover:bg-transparent disabled:active:scale-100 dark:text-slate-100 dark:hover:bg-white/10'
const CAPTION = 'text-[10px] font-bold leading-none'

/** The piece as it will look after the action, with a small badge naming the action. */
function Preview({ pieceId, variant, flipped, badge }: { pieceId: PieceId; variant: number; flipped: boolean; badge: ReactNode }): ReactElement {
  return (
    <span className="relative">
      <PieceIcon className="size-8" flipped={flipped} pieceId={pieceId} variant={variant} />
      <span className="absolute -bottom-0.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-slate-700 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900 [&_svg]:size-2.5">
        {badge}
      </span>
    </span>
  )
}

/**
 * Floating Rotate / Flip / Remove bar for the selected piece. Rotate and Flip show the piece
 * as it will look afterwards, and are disabled when that would not fit where it stands.
 */
export function PieceActionBar(props: PieceActionBarProps): ReactElement {
  const { pieceId, variant, flipped, containerWidth, containerHeight, x, pieceTop, pieceBottom, canRotate, canFlip, rotateFits, flipFits, onRotate, onFlip, onRemove } = props
  const barRef = useRef<HTMLDivElement | null>(null)
  const [barSize, setBarSize] = useState({ width: FALLBACK_BAR_WIDTH, height: FALLBACK_BAR_HEIGHT })

  useLayoutEffect(() => {
    const width = barRef.current?.offsetWidth ?? 0
    const height = barRef.current?.offsetHeight ?? 0
    if (width > 0 && height > 0 && (width !== barSize.width || height !== barSize.height)) {
      setBarSize({ width, height })
    }
  }, [barSize, canFlip, canRotate])

  const left = containerWidth > 0 ? clampToolbarX(x, barSize.width, containerWidth) : x
  const top = placeToolbarY(pieceTop, pieceBottom, barSize.height, containerHeight > 0 ? containerHeight : Number.POSITIVE_INFINITY)
  const variants = PIECES[pieceId].variants.length

  return (
    <div
      aria-label="Piece actions"
      className="absolute z-20 flex -translate-x-1/2 gap-0.5 rounded-2xl border border-white/70 bg-white/95 p-1 shadow-xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95"
      data-testid="piece-action-bar"
      ref={barRef}
      role="toolbar"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canRotate && (
        <button aria-label="Rotate piece" className={BUTTON} disabled={!rotateFits} title={rotateFits ? 'Rotate (R)' : 'No room to rotate here'} type="button" onClick={onRotate}>
          <Preview badge={<RotateCw aria-hidden="true" strokeWidth={3} />} flipped={flipped} pieceId={pieceId} variant={(variant + 1) % variants} />
          <span className={CAPTION}>Rotate</span>
        </button>
      )}
      {canFlip && (
        <button aria-label="Flip piece" className={BUTTON} disabled={!flipFits} title={flipFits ? 'Flip left–right (F)' : 'No room to flip here'} type="button" onClick={onFlip}>
          <Preview badge={<ArrowLeftRight aria-hidden="true" strokeWidth={3} />} flipped={!flipped} pieceId={pieceId} variant={variant} />
          <span className={CAPTION}>Flip</span>
        </button>
      )}
      <button aria-label="Remove piece" className={cn(BUTTON, 'text-rose-600 dark:text-rose-400')} title="Remove (Delete)" type="button" onClick={onRemove}>
        <span className="flex size-8 items-center justify-center">
          <Trash2 aria-hidden="true" className="size-5" />
        </span>
        <span className={CAPTION}>Remove</span>
      </button>
    </div>
  )
}
