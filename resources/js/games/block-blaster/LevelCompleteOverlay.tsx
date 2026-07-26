import { ArrowRight, RotateCcw, Star, Trophy } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

interface LevelCompleteOverlayProps {
  isFinalLevel: boolean
  stars: 1 | 2 | 3
  onNext: () => void
  onReplay: () => void
}

export function LevelCompleteOverlay({ isFinalLevel, stars, onNext, onReplay }: LevelCompleteOverlayProps): ReactElement {
  return (
    <div
      aria-label="Level complete"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
      role="dialog"
    >
      <style>{`
        @keyframes block-blaster-star-enter {
          from {
            opacity: 0;
            transform: scale(0.3) rotate(-25deg);
          }

          to {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        .block-blaster-star {
          animation: block-blaster-star-enter 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .block-blaster-star {
            animation: none;
          }
        }
      `}
      </style>

      <div className="flex flex-col items-center gap-6">
        <div aria-label={`${stars} stars`} className="flex gap-2" data-stars={stars} data-testid="level-complete-stars">
          {([1, 2, 3] as const).map((starPosition) => (
            <Star
              aria-hidden="true"
              className={cn(
                'block-blaster-star size-12',
                starPosition <= stars ? 'fill-amber-400 text-amber-500' : 'fill-none text-white/30',
              )}
              key={starPosition}
              style={{ animationDelay: `${starPosition * 150}ms` }}
            />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            aria-label="Replay level"
            className="flex size-14 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-xl transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100"
            type="button"
            onClick={onReplay}
          >
            <RotateCcw aria-hidden="true" className="size-6" />
          </button>

          {isFinalLevel ? (
            <div
              aria-label="All levels complete"
              className="flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-xl"
            >
              <Trophy aria-hidden="true" className="size-6" />
            </div>
          ) : (
            <button
              aria-label="Next level"
              className="flex size-14 animate-pulse items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-xl transition-transform active:scale-95"
              type="button"
              onClick={onNext}
            >
              <ArrowRight aria-hidden="true" className="size-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
