import type { ReactElement, Ref } from 'react'

import { cn } from '@/lib/utils'

import type { LevelDef } from '../levels/levelTypes'
import { FAMILY_LABELS, FAMILY_ORDER, type PieceId,PIECES } from '../pieces/pieceCatalog'
import { FAMILY_COLORS } from '../scene/palette'
import { PieceIcon } from './PieceIcon'

interface PieceTrayProps {
  level: LevelDef
  remaining: Readonly<Partial<Record<PieceId, number>>>
  armed: PieceId | null
  disabled: boolean
  shakePiece: { pieceId: PieceId; key: number } | null
  onArm: (pieceId: PieceId) => void
  trayRef?: Ref<HTMLDivElement>
  className?: string
}

/**
 * The piece picker: one card per piece type in this level's inventory, grouped by
 * family, with a live count badge. Bottom strip in portrait, left column on wide screens.
 */
export function PieceTray({ level, remaining, armed, disabled, shakePiece, onArm, trayRef, className }: PieceTrayProps): ReactElement {
  const pieceIds = (Object.keys(level.inventory) as PieceId[])
    .filter((pieceId) => (level.inventory[pieceId] ?? 0) > 0)
    .sort((a, b) => FAMILY_ORDER.indexOf(PIECES[a].family) - FAMILY_ORDER.indexOf(PIECES[b].family))
  const families = FAMILY_ORDER.filter((family) => pieceIds.some((pieceId) => PIECES[pieceId].family === family))

  return (
    <div
      aria-label="Piece tray"
      className={cn(
        'z-10 shrink-0 border-white/60 bg-white/80 shadow-lg shadow-slate-950/10 backdrop-blur-md transition-opacity dark:border-white/10 dark:bg-slate-900/80',
        'flex gap-1 overflow-x-auto border-t px-2 py-1.5 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-t-0 md:px-1.5 md:py-3',
        disabled && 'pointer-events-none opacity-45',
        className,
      )}
      data-testid="piece-tray"
      ref={trayRef}
      role="toolbar"
    >
      <style>{`
        @keyframes marble-works-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .marble-works-shake { animation: marble-works-shake 180ms ease-in-out 2; }
        @media (prefers-reduced-motion: reduce) { .marble-works-shake { animation: none; } }
      `}
      </style>
      {families.map((family, familyIndex) => (
        <div className={cn('flex shrink-0 items-end gap-1 md:flex-col md:items-stretch', familyIndex > 0 && 'border-l border-slate-200 pl-1 md:border-l-0 md:border-t md:pl-0 md:pt-1 dark:border-white/10')} key={family}>
          <span className="sr-only">{FAMILY_LABELS[family]}</span>
          <span aria-hidden="true" className="hidden text-center text-[9px] font-black uppercase tracking-wide text-slate-400 md:block">{FAMILY_LABELS[family]}</span>
          {pieceIds.filter((pieceId) => PIECES[pieceId].family === family).map((pieceId) => {
            const count = remaining[pieceId] ?? 0
            const selected = armed === pieceId
            const used = count <= 0

            return (
              <button
                aria-label={`${PIECES[pieceId].name}, ${count} left`}
                aria-pressed={selected}
                className={cn(
                  'relative flex h-[76px] w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border bg-white px-1 pb-1 pt-1.5 text-slate-700 shadow-sm transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-100',
                  selected ? '-translate-y-1 border-transparent shadow-md ring-2' : 'border-slate-200 dark:border-white/10',
                  used && !selected && 'bg-slate-100 text-slate-400 dark:bg-slate-800/60',
                  shakePiece?.pieceId === pieceId && 'marble-works-shake',
                )}
                data-piece={pieceId}
                data-testid={`tray-${pieceId}`}
                key={`${pieceId}-${shakePiece?.pieceId === pieceId ? shakePiece.key : 0}`}
                style={selected ? { ['--tw-ring-color' as string]: FAMILY_COLORS[PIECES[pieceId].family] } : undefined}
                type="button"
                onClick={() => onArm(pieceId)}
              >
                <PieceIcon className="size-10" muted={used} pieceId={pieceId} />
                <span className="w-full truncate text-center text-[10px] font-bold leading-tight">{PIECES[pieceId].name}</span>
                <span
                  className={cn(
                    'absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-[11px] font-black leading-5 text-white shadow-sm dark:border-slate-900',
                    used ? 'bg-slate-400' : 'bg-slate-800',
                    selected && !used && 'motion-safe:animate-pulse',
                  )}
                >
                  ×{count}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
