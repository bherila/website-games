import { AlertTriangle, ArrowRight, LayoutGrid, RotateCcw, Sparkles, Trophy } from 'lucide-react'
import { type ReactElement } from 'react'

import { Button } from '@/components/ui/button'

import { StarRow } from '../_shared/StarRow'
import { type CompletedLevel, type GameState, labelForPowerUp, TOTAL_LEVELS } from './gameEngine'

interface LevelCompleteOverlayProps {
  state: Pick<GameState, 'completedLevel' | 'gameOver'>
  onBackToMenu: () => void
  onNextLevel: () => void
  onRestart: () => void
}

export function LevelCompleteOverlay({ state, onBackToMenu, onNextLevel, onRestart }: LevelCompleteOverlayProps): ReactElement | null {
  if (state.gameOver) {
    return (
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3 pb-24 pt-6 sm:p-6" role="dialog" aria-labelledby="marble-sort-game-over-title">
        <div className="absolute inset-0 bg-rose-950/30 backdrop-blur-[2px] dark:bg-rose-950/45" />
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border border-rose-200 bg-white/95 p-5 text-center shadow-2xl shadow-slate-950/25 sm:p-6 dark:border-rose-900 dark:bg-slate-950/95">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-700 ring-8 ring-rose-100/45 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900/25">
            <AlertTriangle className="size-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-normal text-slate-950 dark:text-slate-50" id="marble-sort-game-over-title">
            Belt Full
          </h2>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{state.gameOver.message}</p>
          <Button className="mt-5 h-11 w-full" type="button" onClick={onRestart}>
            <RotateCcw className="size-4" />
            Reset Level
          </Button>
        </div>
      </div>
    )
  }

  if (!state.completedLevel) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3 pb-24 pt-6 sm:p-6" role="dialog" aria-labelledby="marble-sort-level-complete-title">
      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] dark:bg-slate-950/45" />
      <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border border-emerald-200 bg-white/95 p-5 text-center shadow-2xl shadow-slate-950/25 sm:p-6 dark:border-emerald-900 dark:bg-slate-950/95">
        <div className="absolute right-4 top-4 text-amber-400" aria-hidden="true">
          <Sparkles className="size-5" />
        </div>
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-100/45 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900/25">
          <Trophy className="size-7" />
        </div>

        <StarRow stars={state.completedLevel.stars} />
        <LevelCompleteSummary completedLevel={state.completedLevel} />
        {state.completedLevel.level >= TOTAL_LEVELS && (
          <p className="mx-auto mt-3 max-w-xs text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            You cleared every level — more are on the way!
          </p>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {state.completedLevel.level >= TOTAL_LEVELS
            ? (
                <Button className="h-11 sm:col-span-2" type="button" onClick={onBackToMenu}>
                  <LayoutGrid className="size-4" />
                  Level Select
                </Button>
              )
            : (
                <Button className="h-11 sm:col-span-2" type="button" onClick={onNextLevel}>
                  Next Level
                  <ArrowRight className="size-4" />
                </Button>
              )}
          <Button className="h-11 sm:col-start-3 sm:row-start-1" type="button" variant="outline" onClick={onRestart}>
            <RotateCcw className="size-4" />
            Replay
          </Button>
          {state.completedLevel.level < TOTAL_LEVELS && (
            <Button className="h-11 sm:col-span-3" type="button" variant="ghost" onClick={onBackToMenu}>
              <LayoutGrid className="size-4" />
              Level Select
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LevelCompleteSummary({ completedLevel }: { completedLevel: CompletedLevel }): ReactElement {
  return (
    <>
      <h2 className="text-2xl font-bold tracking-normal text-slate-950 dark:text-slate-50" id="marble-sort-level-complete-title">
        Level {completedLevel.level} Complete
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-left">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Score</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-950 dark:text-slate-50">{completedLevel.score.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Power-up</div>
          <div className="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">{labelForPowerUp(completedLevel.awardedPowerUp)}</div>
        </div>
      </div>
    </>
  )
}
