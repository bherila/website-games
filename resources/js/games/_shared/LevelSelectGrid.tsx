import { ArrowLeft, Lock, Star } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export interface LevelSelectProgress {
  unlockedLevel: number
  stars: Record<number, number>
}

interface LevelSelectGridProps {
  emoji: string
  title: string
  levelIds: readonly number[]
  progress: LevelSelectProgress
  exitHref?: string
  footer?: string
  onSelectLevel: (levelId: number) => void
}

/**
 * Shared campaign level-select grid: locked tiles past the unlock watermark,
 * best-star rows on unlocked tiles, and a pulse on the next unplayed level.
 */
export function LevelSelectGrid({ emoji, title, levelIds, progress, exitHref, footer, onSelectLevel }: LevelSelectGridProps): ReactElement {
  const nextUnplayedLevelId = findNextUnplayedLevelId(levelIds, progress)

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      {/* m-auto (not justify-center on the scroll container) so a grid taller
          than the viewport scrolls from its top instead of clipping it. */}
      <div className="m-auto flex min-h-full w-fit flex-col items-center justify-center gap-4">
        {exitHref && (
          <a
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-200"
            data-testid="level-select-exit"
            href={exitHref}
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            All Games
          </a>
        )}
        <span aria-hidden="true" className="text-4xl">{emoji}</span>
        <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {levelIds.map((levelId) => (
            <LevelTile
              key={levelId}
              levelId={levelId}
              pulsing={levelId === nextUnplayedLevelId}
              stars={progress.stars[levelId] ?? 0}
              unlocked={levelId <= progress.unlockedLevel}
              onSelect={onSelectLevel}
            />
          ))}
        </div>
        {footer && <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{footer}</p>}
      </div>
    </div>
  )
}

interface LevelTileProps {
  levelId: number
  pulsing: boolean
  stars: number
  unlocked: boolean
  onSelect: (levelId: number) => void
}

function LevelTile({ levelId, pulsing, stars, unlocked, onSelect }: LevelTileProps): ReactElement {
  if (!unlocked) {
    return (
      <div
        aria-label={`Level ${levelId} locked`}
        className="flex size-14 items-center justify-center rounded-xl border border-slate-300/70 bg-slate-200/70 text-slate-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-600"
        data-testid={`level-tile-${levelId}`}
        data-unlocked="false"
      >
        <Lock aria-hidden="true" className="size-5" />
      </div>
    )
  }

  return (
    <button
      aria-label={`Level ${levelId}, ${stars} stars`}
      className={cn(
        'flex size-14 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/70 bg-white/90 text-slate-900 shadow-md shadow-slate-950/10 transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-50',
        pulsing && 'animate-pulse',
      )}
      data-testid={`level-tile-${levelId}`}
      data-unlocked="true"
      type="button"
      onClick={() => onSelect(levelId)}
    >
      <span className="text-lg font-black leading-none tabular-nums">{levelId}</span>
      <span className="flex gap-0.5">
        {([0, 1, 2] as const).map((starIndex) => (
          <Star
            aria-hidden="true"
            className={cn(
              'size-2.5',
              starIndex < stars ? 'fill-amber-400 text-amber-500' : 'fill-none text-slate-300 dark:text-slate-700',
            )}
            key={starIndex}
          />
        ))}
      </span>
    </button>
  )
}

function findNextUnplayedLevelId(levelIds: readonly number[], progress: LevelSelectProgress): number | null {
  const nextLevelId = levelIds.find((levelId) => levelId <= progress.unlockedLevel && progress.stars[levelId] === undefined)

  return nextLevelId ?? null
}
