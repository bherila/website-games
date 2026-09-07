/**
 * Responsive frame: diorama + DOM panel. Desktop: diorama fills the left, the
 * panel sits on the right at a readable width — no stretched phone column.
 *
 * Phone: the diorama is bounded on narrative screens and collapses to a slim
 * strip while a question is open. It used to take min(38dvh,300px) on every
 * route, which pushed the later answer options and the Check button below the
 * fold on a 390×844 viewport — the learner scrolled between hearing a prompt
 * and answering it. The scenery is decorative (see DioramaCanvas), so on the
 * scored screens it yields to the task and the learner can call it back.
 */
import { ChevronDown, ChevronUp, Map as MapIcon, Settings as SettingsIcon } from 'lucide-react'
import { type ReactElement, type ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'

import { DioramaCanvas } from '../scene/DioramaCanvas'
import { ConfirmDialog } from './ConfirmDialog'
import { DialogueStage } from './DialogueStage'
import { type GameApi, type Route, useGame } from './GameContext'
import { GameButton } from './primitives'
import { SaveStatusChip } from './SaveStatusChip'

/** Where the learner is, with nothing in it that could answer the open question. */
function stripLabel(game: GameApi): string {
  switch (game.route.name) {
    case 'review': return 'Review'
    case 'checkpoint': return 'Listening check'
    default: return `Scene ${game.course.sceneById.get(game.sceneId)?.order ?? 1} of ${game.course.scenes.length}`
  }
}

interface GameShellProps {
  children: ReactNode
  /** Hide the scenery entirely (home / settings use a slimmer header). */
  scenery?: boolean
  title?: string
}

export function GameShell({ children, scenery = true, title }: GameShellProps): ReactElement {
  const game = useGame()
  const inLesson = game.route.name !== 'home' && game.route.name !== 'settings' && game.route.name !== 'onboarding'
  const [confirmGlossary, setConfirmGlossary] = useState(false)

  // Scored screens start collapsed on phones every time they are entered:
  // expanding is a deliberate look, not a preference that reinstates the
  // cramped layout on the next question. The open flag is stored against the
  // route it was set on, so a new screen is collapsed on its first render
  // rather than one frame later.
  const scored = game.route.name === 'lesson' || game.route.name === 'review' || game.route.name === 'checkpoint'
  const [expandedOn, setExpandedOn] = useState<Route | null>(null)
  const sceneryOpen = expandedOn === game.route
  const collapsed = scenery && scored && !sceneryOpen

  // The glossary carries the English meaning of every introduced word. Reaching
  // it while a question is unanswered is help, and has to be accounted for the
  // same way the in-question Help control is.
  const active = game.activeAssessment
  const glossaryLocked = active !== null && active.strict && active.unanswered
  const glossaryCostsHelp = active !== null && !active.strict && active.unanswered

  function toggleGlossary(): void {
    if (game.overlay === 'glossary') {
      game.setOverlay(null)
      return
    }
    if (glossaryLocked) return
    if (glossaryCostsHelp) {
      setConfirmGlossary(true)
      return
    }
    game.setOverlay('glossary')
  }

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
            <GameButton
              variant="quiet"
              className="min-h-11"
              onClick={toggleGlossary}
              disabled={glossaryLocked}
              aria-pressed={game.overlay === 'glossary'}
              title={glossaryLocked ? 'Words is unavailable until you answer this check item.' : glossaryCostsHelp ? 'Opening Words counts as help on this question.' : undefined}
              data-testid="glossary-button"
              data-glossary-help={glossaryLocked ? 'locked' : glossaryCostsHelp ? 'costs-help' : 'free'}
            >
              <span className="text-base" aria-hidden="true">词</span>
              <span className="hidden sm:inline">Words</span>
              {glossaryCostsHelp && <span className="sr-only">(counts as help on this question)</span>}
            </GameButton>
          )}
          <GameButton variant="quiet" className="min-h-11" onClick={() => game.navigate({ name: 'settings' })} aria-label="Settings">
            <SettingsIcon aria-hidden="true" className="size-5" />
          </GameButton>
        </div>
      </header>
      <div className={cn('flex min-h-0 flex-1 flex-col', scenery && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]')}>
        {scenery && (
          <>
            {/* Collapsed is a phone state only: from `lg` the diorama is a side
                column and costs the question no vertical space at all. */}
            <div
              className={cn(
                'relative w-full shrink-0 lg:h-auto lg:min-h-0',
                collapsed ? 'hidden lg:block' : 'h-[min(38dvh,300px)]',
              )}
            >
              <DioramaCanvas
                setting={game.setting}
                beat={game.beat}
                posterSlotId={game.posterSlotId}
                mode={game.settings.twoDMode ? '2d' : '3d'}
                reducedMotion={game.reducedMotion}
                className="absolute inset-0 h-full w-full"
              />
              {/* A sibling of the canvas, never a child: the canvas and its
                  poster are aria-hidden decoration, and an ancestor of theirs
                  would hide this too. Teaching only, so expanding the scene
                  during a question can never surface the last line spoken. */}
              {game.route.name === 'teaching' && <DialogueStage course={game.course} />}
            </div>
            {scored && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e6dfcf] bg-[#f5efe3] px-3 py-1.5 lg:hidden">
                {/* Neutral by construction: a scene summary or node title can
                    disclose what an unanswered question is asking. */}
                <p className="text-xs font-semibold text-[#6d7a86]">{stripLabel(game)}</p>
                <GameButton
                  variant="quiet"
                  className="min-h-11 px-2 text-[13px]"
                  onClick={() => setExpandedOn(sceneryOpen ? null : game.route)}
                  aria-expanded={sceneryOpen}
                  data-testid="scenery-toggle"
                >
                  {sceneryOpen ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                  {sceneryOpen ? 'Hide scene' : 'Show scene'}
                </GameButton>
              </div>
            )}
          </>
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
      {confirmGlossary && (
        <ConfirmDialog
          testId="glossary-help-confirm"
          title="Opening Words counts as help"
          body="The word list shows the English meaning of everything you have learned, so this question will be recorded as answered with help. You can still answer it either way."
          confirmLabel="Open Words"
          cancelLabel="Keep listening"
          onConfirm={() => {
            active?.revealMeaning()
            setConfirmGlossary(false)
            game.setOverlay('glossary')
          }}
          onCancel={() => setConfirmGlossary(false)}
        />
      )}
    </div>
  )
}
