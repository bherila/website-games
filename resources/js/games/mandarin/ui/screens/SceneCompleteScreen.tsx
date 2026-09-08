/** Scene completion beat. Honest summary: story unlock, not mastery. */
import { type ReactElement, useEffect } from 'react'

import { cn } from '@/lib/utils'

import { summarizeScene } from '../../domain/progress'
import { useGame } from '../GameContext'
import { PreviewBanner } from '../PreviewBanner'
import { Chip, Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'

export function SceneCompleteScreen({ sceneId }: { sceneId: string }): ReactElement {
  const game = useGame()
  const { course, progress } = game
  const scene = course.sceneById.get(sceneId)
  const summary = summarizeScene(progress, course, sceneId)
  const nextScene = course.scenes.find((item) => item.order === (scene?.order ?? 0) + 1) ?? null
  const nextNodeId = nextScene?.nodeIds[0] ?? null
  const isFinal = !nextScene

  useEffect(() => {
    game.setBeat('complete')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  if (!scene) return <Panel>Unknown scene.</Panel>
  return (
    <div className="flex flex-col gap-3" data-testid="scene-complete-screen" data-scene-id={sceneId}>
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-3">
        <Eyebrow>Scene {scene.order} complete</Eyebrow>
        <SectionTitle>{isFinal ? 'You made it to the supper.' : `${scene.title}: done.`}</SectionTitle>
        {scene.resolution && <p data-testid="story-resolution">{scene.resolution}</p>}
        <p className={cn('text-sm', MUTED)}>
          {isFinal
            ? 'This episode ends here. The listening check is now open; it uses lines you have not heard before.'
            : 'The next scene is unlocked. Completing a scene means you got through it, not that every word is remembered. Review keeps it fresh.'}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#faf7f0] p-2">
            <dt className={cn('text-xs', MUTED)}>Questions</dt>
            <dd className="text-xl font-bold">{summary.questions}</dd>
          </div>
          <div className="rounded-xl bg-[#faf7f0] p-2">
            <dt className={cn('text-xs', MUTED)}>Right first, unaided</dt>
            <dd className="text-xl font-bold">{summary.firstAttemptCorrect}</dd>
          </div>
          <div className="rounded-xl bg-[#faf7f0] p-2">
            <dt className={cn('text-xs', MUTED)}>Used help or retry</dt>
            <dd className="text-xl font-bold">{summary.usedHelp}</dd>
          </div>
        </dl>
        <div>
          <p className="text-sm font-bold">Words met in this scene</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {summary.newTargetIds.map((id) => {
              const target = course.targetById.get(id)
              return target ? <li key={id}><Chip tone="jade"><span lang="zh-Hans">{target.zh}</span> · {target.en}</Chip></li> : null
            })}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextNodeId && (
            <GameButton variant="primary" size="lg" onClick={() => game.navigate({ name: 'teaching', nodeId: nextNodeId })} data-testid="next-scene">
              Scene {nextScene?.order}: {nextScene?.title}
            </GameButton>
          )}
          {isFinal && (
            <GameButton variant="primary" size="lg" onClick={() => game.navigate({ name: 'checkpoint' })} data-testid="open-listening-check">
              Open the listening check
            </GameButton>
          )}
          <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
        </div>
      </Panel>
    </div>
  )
}
