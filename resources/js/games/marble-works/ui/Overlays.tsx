import { ArrowRight, Check, Gem, Grid3x3, Puzzle, RotateCcw, Star, Trophy, X } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { StarBreakdown } from '../board/grid'
import { MARBLE_KINDS, type MarbleKind } from '../physics/marbles'
import type { FailStatus } from '../physics/runOutcome'

export interface WinSummary extends StarBreakdown {
  pieces: number
  parPieces: number
  gemsCollected: number
  gemsTotal: number
}

interface LevelCompleteOverlayProps {
  isFinalLevel: boolean
  summary: WinSummary
  onNext: () => void
  onReplay: () => void
  onLevels: () => void
}

const ROUND = 'flex size-14 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95'

function Goal({ met, icon, children }: { met: boolean; icon: ReactElement; children: string }): ReactElement {
  return (
    <li className={cn('flex items-center gap-2 text-sm font-semibold', met ? 'text-white' : 'text-white/65')}>
      <span className={cn('flex size-5 items-center justify-center rounded-full', met ? 'bg-emerald-500' : 'bg-white/20')}>
        {met ? <Check aria-hidden="true" className="size-3.5" /> : <X aria-hidden="true" className="size-3.5" />}
      </span>
      {icon}
      {children}
    </li>
  )
}

export function LevelCompleteOverlay({ isFinalLevel, summary, onNext, onReplay, onLevels }: LevelCompleteOverlayProps): ReactElement {
  const { stars, pieces, parPieces, gemsCollected, gemsTotal } = summary

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
        <ul className="flex flex-col gap-1.5" data-testid="level-complete-goals">
          {gemsTotal > 0 && (
            <Goal icon={<Gem aria-hidden="true" className="size-4 text-rose-300" />} met={summary.gems}>
              {`Gems ${gemsCollected} of ${gemsTotal}`}
            </Goal>
          )}
          <Goal icon={<Puzzle aria-hidden="true" className="size-4 text-amber-200" />} met={summary.par}>
            {`${pieces === 1 ? '1 piece' : `${pieces} pieces`} (par ${parPieces})`}
          </Goal>
        </ul>
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

const FAIL_MESSAGES: Record<FailStatus, (marble: string) => string> = {
  out: (marble) => `The ${marble} fell off the board.`,
  stuck: (marble) => `The ${marble} got stuck.`,
  timeout: () => 'The marbles never made it.',
  wrong: (marble) => `That basket doesn’t take the ${marble}.`,
  full: (marble) => `That basket was already full when the ${marble} arrived.`,
}

export function RunFailedToast({ status, kind }: { status: FailStatus; kind: MarbleKind | null }): ReactElement {
  const marble = kind ? MARBLE_KINDS[kind].label.toLowerCase() : 'marble'

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      data-testid="run-failed"
      role="status"
    >
      <div className="rounded-2xl bg-slate-900/85 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
        {FAIL_MESSAGES[status](marble)} <span className="font-medium text-white/75">The dots show where it went.</span>
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
