import { Gem, Lightbulb, Puzzle } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { LevelDef } from '../levels/levelTypes'
import { MARBLE_KINDS } from '../physics/marbles'
import { marbleSchedule } from '../physics/runWorld'
import { MarbleChip } from './MarbleChip'

interface GameHudProps {
  level: LevelDef
  piecesUsed: number
  gemsCollected: number
  hintOpen: boolean
  onToggleHint: () => void
}

const PILL = 'rounded-2xl border border-white/70 bg-white/85 px-3 py-1.5 shadow-lg shadow-slate-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80'

/**
 * Level pill with the marbles in release order (left), and the two star goals — pieces
 * within par and gems collected — plus the hint toggle (right).
 */
export function GameHud({ level, piecesUsed, gemsCollected, hintOpen, onToggleHint }: GameHudProps): ReactElement {
  const marbles = marbleSchedule(level)
  const overPar = piecesUsed > level.par
  const gemsTotal = level.gems.length

  return (
    <>
      <div className={cn(PILL, 'pointer-events-none absolute left-2 top-2 z-10 flex max-w-[55%] flex-col gap-1')} data-testid="level-pill">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black leading-none tabular-nums text-slate-900 dark:text-slate-50">{level.id}</span>
          <span className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{level.title}</span>
        </div>
        {marbles.length > 1 || marbles[0]?.kind !== 'glass' ? (
          <div aria-label={`Marbles: ${marbles.map((marble) => MARBLE_KINDS[marble.kind].label).join(', ')}`} className="flex items-center gap-1" data-testid="marble-queue" role="img">
            {marbles.map((marble) => <MarbleChip key={`${marble.dropper}-${marble.releaseAt}`} kind={marble.kind} />)}
          </div>
        ) : null}
      </div>

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        <div
          aria-label={`${piecesUsed} pieces placed, par ${level.par}.${gemsTotal > 0 ? ` ${gemsCollected} of ${gemsTotal} gems.` : ''}`}
          className={cn(PILL, 'flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200')}
          data-testid="par-pill"
          role="status"
        >
          <span className={cn('flex items-center gap-1 tabular-nums', overPar && 'text-rose-600 dark:text-rose-400')}>
            <Puzzle aria-hidden="true" className="size-3.5" />
            {piecesUsed}
            <span className="font-semibold text-slate-400">/ {level.par}</span>
          </span>
          {gemsTotal > 0 && (
            <span className={cn('flex items-center gap-1 tabular-nums', gemsCollected >= gemsTotal && 'text-rose-500')} data-testid="gem-count">
              <Gem aria-hidden="true" className={cn('size-3.5', gemsCollected >= gemsTotal && 'fill-rose-200')} />
              {gemsCollected}/{gemsTotal}
            </span>
          )}
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
