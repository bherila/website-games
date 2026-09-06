/** Map and glossary overlays. Glossary never lists reserved checkpoint lines. */
import { X } from 'lucide-react'
import { type ReactElement, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { learnerVisibleVocabulary, nodeStatus } from '../domain/progress'
import { useGame } from './GameContext'
import { JourneyMap } from './JourneyMap'
import { GameButton, MUTED, SectionTitle } from './primitives'
import { PromptPlayer } from './PromptPlayer'

function OverlayFrame({ title, children, onClose, testId }: { title: string; children: ReactElement; onClose: () => void; testId: string }): ReactElement {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#2f3a44]/50 sm:items-center" onClick={onClose} data-testid={testId}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-[#f5efe3] shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between border-b border-[#e6dfcf] px-4 py-3">
          <SectionTitle>{title}</SectionTitle>
          <GameButton ref={closeRef} variant="quiet" onClick={onClose} aria-label="Close" className="min-h-11 px-2"><X aria-hidden="true" className="size-5" /></GameButton>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}

export function MapOverlay(): ReactElement {
  const game = useGame()
  return (
    <OverlayFrame title="Journey map" onClose={() => game.setOverlay(null)} testId="map-overlay">
      <JourneyMap
        compact
        course={game.course}
        progress={game.progress}
        onOpenNode={(nodeId) => {
          game.setOverlay(null)
          const status = nodeStatus(game.progress, game.course, nodeId)
          game.navigate(status === 'introduced' ? { name: 'lesson', nodeId } : { name: 'teaching', nodeId })
        }}
      />
    </OverlayFrame>
  )
}

export function GlossaryOverlay(): ReactElement {
  const game = useGame()
  const { course, progress, settings } = game
  const vocabulary = learnerVisibleVocabulary(progress, course)
  const showPinyin = settings.pinyinAssist === 'always'
  return (
    <OverlayFrame title="Words so far" onClose={() => game.setOverlay(null)} testId="glossary-overlay">
      <div className="flex flex-col gap-3">
        {vocabulary.targetIds.length === 0 && <p className={cn('text-sm', MUTED)}>No words yet. They appear here as each lesson introduces them.</p>}
        <ul className="flex flex-col gap-2">
          {vocabulary.targetIds.map((id) => {
            const target = course.targetById.get(id)
            if (!target) return null
            return (
              <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e2dccd] bg-white p-3" data-testid="glossary-entry">
                <div>
                  <p lang="zh-Hans" className="text-xl font-medium">{target.zh}</p>
                  {showPinyin && <p lang="zh-Latn-pinyin" className={cn('text-sm', MUTED)}>{target.pinyin}</p>}
                  <p className="text-sm">{target.en}</p>
                </div>
                <PromptPlayer source={{ sourceKind: 'target', sourceId: target.id, variant: 'normal' }} size="md" playLabel="Play" />
              </li>
            )
          })}
        </ul>
        {vocabulary.supportIds.length > 0 && (
          <p className={cn('text-sm', MUTED)}>
            Context words: {vocabulary.supportIds.map((id) => course.supportById.get(id)).filter((item) => item !== undefined).map((item) => `${item.zh} · ${item.en}`).join('; ')}
          </p>
        )}
      </div>
    </OverlayFrame>
  )
}
