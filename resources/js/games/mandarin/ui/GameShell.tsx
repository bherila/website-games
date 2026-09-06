/**
 * Responsive frame: diorama + DOM panel. Phone: diorama on top (bounded
 * height), scrolling panel below. Desktop: diorama fills the left, the panel
 * sits on the right at a readable width — no stretched phone column.
 */
import { Map as MapIcon, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { DioramaCanvas } from '../scene/DioramaCanvas'
import { useGame } from './GameContext'
import { GameButton } from './primitives'
import { SaveStatusChip } from './SaveStatusChip'

interface GameShellProps {
  children: ReactNode
  /** Hide the scenery entirely (home / settings use a slimmer header). */
  scenery?: boolean
  title?: string
}

export function GameShell({ children, scenery = true, title }: GameShellProps): ReactElement {
  const game = useGame()
  const inLesson = game.route.name !== 'home' && game.route.name !== 'settings' && game.route.name !== 'onboarding'
  return (
    <div
      className="mandarin-root flex h-dvh w-full flex-col bg-[#f5efe3] text-[#2f3a44] antialiased"
      style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      data-route={game.route.name}
    >
      <header
        className="flex items-center justify-between gap-2 border-b border-[#e6dfcf] bg-[#f5efe3]/95 px-3 py-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GameButton variant="quiet" className="min-h-10 px-2" onClick={() => game.navigate({ name: 'home' })} aria-label="Home">
            <span aria-hidden="true" className="text-base font-black tracking-tight">MQ</span>
          </GameButton>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{title ?? 'Mandarin Quest'}</p>
            <div className="hidden sm:block"><SaveStatusChip state={game.saveState} /></div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {inLesson && (
            <GameButton variant="quiet" className="min-h-11" onClick={() => game.setOverlay(game.overlay === 'map' ? null : 'map')} aria-pressed={game.overlay === 'map'}>
              <MapIcon aria-hidden="true" className="size-5" />
              <span className="hidden sm:inline">Map</span>
            </GameButton>
          )}
          {inLesson && (
            <GameButton variant="quiet" className="min-h-11" onClick={() => game.setOverlay(game.overlay === 'glossary' ? null : 'glossary')} aria-pressed={game.overlay === 'glossary'}>
              <span className="text-base" aria-hidden="true">词</span>
              <span className="hidden sm:inline">Words</span>
            </GameButton>
          )}
          <GameButton variant="quiet" className="min-h-11" onClick={() => game.navigate({ name: 'settings' })} aria-label="Settings">
            <SettingsIcon aria-hidden="true" className="size-5" />
          </GameButton>
        </div>
      </header>
      <div className={cn('flex min-h-0 flex-1 flex-col', scenery && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]')}>
        {scenery && (
          <DioramaCanvas
            setting={game.setting}
            beat={game.beat}
            posterSlotId={game.posterSlotId}
            mode={game.settings.twoDMode ? '2d' : '3d'}
            reducedMotion={game.reducedMotion}
            className="h-[min(38dvh,300px)] w-full shrink-0 lg:h-auto lg:min-h-0"
          />
        )}
        <main
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:border-l lg:border-[#e6dfcf]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 lg:max-w-none">
            <div className="sm:hidden"><SaveStatusChip state={game.saveState} /></div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
