import { Lightbulb, Star } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { LevelDef } from '../levels/levelTypes'

interface GameHudProps {
  level: LevelDef
  piecesUsed: number
  hintOpen: boolean
  onToggleHint: () => void
}

const PILL = 'rounded-2xl border border-white/70 bg-white/85 px-3 py-1.5 shadow-lg shadow-slate-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80'

/** Level pill (left) and pieces-vs-par pill + hint toggle (right). */
export function GameHud({ level, piecesUsed, hintOpen, onToggleHint }: GameHudProps): ReactElement {
  const target = piecesUsed <= level.par.three
    ? { stars: 3, limit: level.par.three }
    : piecesUsed <= level.par.two
      ? { stars: 2, limit: level.par.two }
      : { stars: 1, limit: null }

  return (
    <>
      <div className={cn(PILL, 'pointer-events-none absolute left-2 top-2 z-10 flex items-baseline gap-2')} data-testid="level-pill">
        <span className="text-xl font-black leading-none tabular-nums text-slate-900 dark:text-slate-50">{level.id}</span>
        <span className="max-w-32 truncate text-xs font-bold text-slate-600 dark:text-slate-300">{level.title}</span>
      </div>

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        <div
          aria-label={`${piecesUsed} pieces placed. ${target.limit === null ? '1 star' : `${target.stars} stars at ${target.limit} or fewer`}`}
          className={cn(PILL, 'flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200')}
          data-testid="par-pill"
          role="status"
        >
          <span className="tabular-nums">Pieces {piecesUsed}</span>
          <span aria-hidden="true" className="flex items-center gap-0.5 text-amber-500">
            {[1, 2, 3].map((position) => (
              <Star className={cn('size-3', position <= target.stars ? 'fill-amber-400' : 'fill-none text-slate-300')} key={position} />
            ))}
          </span>
          {target.limit !== null && <span className="tabular-nums text-slate-500 dark:text-slate-400">≤ {target.limit}</span>}
        </div>
        {level.hint && (
          <button
            aria-expanded={hintOpen}
            aria-label="Hint"
            className={cn(PILL, 'flex size-9 items-center justify-center p-0 text-amber-500 transition-transform active:scale-95', hintOpen && 'bg-amber-100 dark:bg-amber-900/60')}
            data-testid="hint-button"
            type="button"
            onClick={onToggleHint}
          >
            <Lightbulb aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </>
  )
}
