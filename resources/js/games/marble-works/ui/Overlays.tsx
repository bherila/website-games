import { ArrowRight, Grid3x3, RotateCcw, Star, Trophy } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { RunStatus } from '../physics/runOutcome'

interface LevelCompleteOverlayProps {
  isFinalLevel: boolean
  stars: 1 | 2 | 3
  piecesUsed: number
  onNext: () => void
  onReplay: () => void
  onLevels: () => void
}

const ROUND = 'flex size-14 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95'

export function LevelCompleteOverlay({ isFinalLevel, stars, piecesUsed, onNext, onReplay, onLevels }: LevelCompleteOverlayProps): ReactElement {
  return (
    <div aria-label="Level complete" className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]" role="dialog">
      <style>{`
        @keyframes marble-works-star-enter {
          from { opacity: 0; transform: scale(0.3) rotate(-25deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .marble-works-star { animation: marble-works-star-enter 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) { .marble-works-star { animation: none; } }
      `}
      </style>
      <div className="flex flex-col items-center gap-5">
        <p className="text-2xl font-black tracking-tight text-white drop-shadow">Into the basket!</p>
        <div aria-label={`${stars} stars`} className="flex gap-2" data-stars={stars} data-testid="level-complete-stars">
          {([1, 2, 3] as const).map((position) => (
            <Star
              aria-hidden="true"
              className={cn('marble-works-star size-12', position <= stars ? 'fill-amber-400 text-amber-500' : 'fill-none text-white/30')}
              key={position}
              style={{ animationDelay: `${position * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-sm font-semibold text-white/90">{piecesUsed === 1 ? '1 piece used' : `${piecesUsed} pieces used`}</p>
        <div className="flex items-center gap-4">
          <button aria-label="Level select" className={cn(ROUND, 'size-12 border border-white/70 bg-white/90 text-slate-800 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100')} type="button" onClick={onLevels}>
            <Grid3x3 aria-hidden="true" className="size-5" />
          </button>
          <button aria-label="Replay level" className={cn(ROUND, 'border border-white/70 bg-white/90 text-slate-800 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100')} type="button" onClick={onReplay}>
            <RotateCcw aria-hidden="true" className="size-6" />
          </button>
          {isFinalLevel ? (
            <div aria-label="All levels complete" className={cn(ROUND, 'bg-gradient-to-b from-amber-400 to-amber-600 text-white')}>
              <Trophy aria-hidden="true" className="size-6" />
            </div>
          ) : (
            <button aria-label="Next level" className={cn(ROUND, 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white motion-safe:animate-pulse')} type="button" onClick={onNext}>
              <ArrowRight aria-hidden="true" className="size-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const FAIL_MESSAGES: Record<Exclude<RunStatus, 'running' | 'won'>, string> = {
  out: 'The marble fell off the board.',
  stuck: 'The marble got stuck.',
  timeout: 'The marble never made it.',
}

export function RunFailedToast({ status }: { status: Exclude<RunStatus, 'running' | 'won'> }): ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      data-testid="run-failed"
      role="status"
    >
      <div className="rounded-2xl bg-slate-900/85 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
        {FAIL_MESSAGES[status]} <span className="font-medium text-white/75">The dots show where it went.</span>
      </div>
    </div>
  )
}

export function HintBubble({ text, onClose }: { text: string; onClose: () => void }): ReactElement {
  return (
    <button
      className="absolute inset-x-3 bottom-3 z-20 mx-auto block max-w-sm rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-2.5 text-left text-sm font-semibold text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100"
      data-testid="hint-bubble"
      type="button"
      onClick={onClose}
    >
      💡 {text}
    </button>
  )
}
