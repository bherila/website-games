/** Teach-before-scoring: story beat, dialogue lines with play controls, new words. */
import { type ReactElement, useEffect } from 'react'

import { cn } from '@/lib/utils'

import type { AudioSourceRef } from '../../contracts/mandarin'
import { teachingExposureEvent } from '../../domain/events'
import { markNodeIntroduced } from '../../domain/progress'
import { CharacterPractice } from '../CharacterPractice'
import { DialogueLine } from '../DialogueLine'
import { useGame } from '../GameContext'
import { PreviewBanner } from '../PreviewBanner'
import { Chip, Eyebrow, GameButton, MUTED, Panel, SectionTitle, SpokenText } from '../primitives'
import { PromptPlayer } from '../PromptPlayer'
import { useRuntime } from '../RuntimeContext'

export function TeachingScreen({ nodeId }: { nodeId: string }): ReactElement {
  const game = useGame()
  const { audio } = useRuntime()
  const { course, settings } = game
  const node = course.nodeById.get(nodeId)
  const scene = course.sceneForNode(nodeId)
  const showPinyin = settings.pinyinAssist === 'always'

  useEffect(() => {
    game.updateProgress((progress) => markNodeIntroduced(progress, nodeId))
    game.appendEvents([teachingExposureEvent(game.eventContext, scene.id, nodeId)])
    game.setBeat('idle')
    // Once per node visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  useEffect(() => {
    if (!node) return
    const refs: AudioSourceRef[] = [
      ...node.teachingUtteranceIds.map((id): AudioSourceRef => ({ sourceKind: 'utterance', sourceId: id, variant: 'normal' })),
      ...node.introducedTargetIds.map((id): AudioSourceRef => ({ sourceKind: 'target', sourceId: id, variant: 'normal' })),
    ]
    audio.ensure(refs)
  }, [audio, node])

  if (!node) return <Panel>Unknown node.</Panel>
  const utterances = node.teachingUtteranceIds.map((id) => course.utteranceById.get(id)).filter((item) => item !== undefined).filter((item) => !course.reservedUtteranceIds.has(item.id))
  const targets = node.introducedTargetIds.map((id) => course.targetById.get(id)).filter((item) => item !== undefined)
  const supports = node.introducedSupportIds.map((id) => course.supportById.get(id)).filter((item) => item !== undefined)

  return (
    <div className="flex flex-col gap-3" data-testid="teaching-screen" data-node-id={nodeId}>
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-2">
        <Eyebrow>Scene {scene.order} · {scene.title}</Eyebrow>
        <SectionTitle>{node.title}</SectionTitle>
        <p className={cn('text-sm', MUTED)}>{node.storyBeat ?? scene.setup}</p>
      </Panel>

      <section aria-labelledby="dialogue" className="flex flex-col gap-2">
        <h2 id="dialogue" className="text-base font-bold">Listen to the exchange</h2>
        <p className={cn('text-sm', MUTED)}>Start with the voices. Reveal Chinese to connect sound with characters, or ask for the meaning whenever you need it. This is teaching, not a test.</p>
        {utterances.map((utterance) => (
          <DialogueLine key={utterance.id} course={course} utterance={utterance} showPinyin={showPinyin} />
        ))}
      </section>
      <details className="rounded-xl border border-[#e2dccd] bg-white/80 p-3">
        <summary className="cursor-pointer font-bold">Explore the words and meaning</summary>
        <section aria-labelledby="new-words" className="flex flex-col gap-2">
          <h2 id="new-words" className="text-base font-bold">New words <Chip tone="jade" className="ml-1 align-middle">{targets.length} new</Chip></h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {targets.map((target) => (
              <li key={target.id} className="flex flex-col gap-2 rounded-xl border border-[#e2dccd] bg-white/90 p-3" data-testid="target-card" data-target-id={target.id}>
                <SpokenText zh={target.zh} pinyin={target.pinyin} en={target.en} showPinyin={showPinyin} size="md" />
                {target.notes.length > 0 && <p className={cn('text-xs', MUTED)}>{target.notes.join(' ')}</p>}
                <PromptPlayer source={{ sourceKind: 'target', sourceId: target.id, variant: 'normal' }} slowSource={{ sourceKind: 'target', sourceId: target.id, variant: 'slow' }} size="md" playLabel="Play" />
              </li>
            ))}
          </ul>
          {supports.length > 0 && (
            <p className={cn('text-sm', MUTED)}>
              Also appears: {supports.map((support) => `${support.zh} (${support.pinyin}, ${support.en})`).join('; ')}. Shown for context, not tested.
            </p>
          )}
        </section>
        <div className="mt-3 text-sm"><p className="font-bold">{scene.grammarNote.title}</p><p>{scene.grammarNote.body}</p></div>
      </details>
      <CharacterPractice key={nodeId} course={course} utterances={utterances} />

      <div className="sticky bottom-0 -mx-3 border-t border-[#e6dfcf] bg-[#f5efe3]/95 px-3 py-3 sm:-mx-4 sm:px-4">
        <GameButton variant="primary" size="lg" block onClick={() => { audio.stop(); game.navigate({ name: 'lesson', nodeId }) }} data-testid="start-questions">
          I’m ready. Start the questions
        </GameButton>
      </div>
    </div>
  )
}
