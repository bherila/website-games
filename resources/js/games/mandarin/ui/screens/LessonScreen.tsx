/** Runs a node's listening questions, then its construction exercises, then completes the node. */
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { summarizeOpportunity } from '../../domain/assessment'
import type { ChoiceExercise } from '../../domain/courseSchema'
import { constructionEvent, nodeCompleteEvent, sceneCompleteEvent } from '../../domain/events'
import { completeNode, recordConstruction, recordOpportunity } from '../../domain/progress'
import { ConstructionExercise } from '../ConstructionExercise'
import { useGame } from '../GameContext'
import { ListeningQuestion } from '../ListeningQuestion'
import { PreviewBanner } from '../PreviewBanner'
import { Eyebrow, GameButton, MUTED, Panel } from '../primitives'
import { useRuntime } from '../RuntimeContext'
import { useAssessment } from '../useAssessment'

type Step = { kind: 'exercise'; id: string } | { kind: 'construction'; id: string }

export function LessonScreen({ nodeId }: { nodeId: string }): ReactElement {
  const game = useGame()
  const { audio } = useRuntime()
  const { course } = game
  const node = course.nodeById.get(nodeId)
  const scene = course.sceneForNode(nodeId)
  const steps = useMemo<Step[]>(() => node ? [
    ...node.exerciseIds.map((id): Step => ({ kind: 'exercise', id })),
    ...node.constructionIds.map((id): Step => ({ kind: 'construction', id })),
  ] : [], [node])
  const [index, setIndex] = useState(0)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    setIndex(0)
    setRunId((value) => value + 1)
    game.setBeat('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  useEffect(() => {
    if (!node) return
    audio.ensure(node.exerciseIds.flatMap((id) => {
      const exercise = course.exerciseById.get(id)
      const ref = exercise?.promptAudio[0]
      return ref ? [{ ...ref }, { ...ref, variant: 'slow' as const }] : []
    }))
  }, [audio, course, node])

  if (!node) return <Panel>Unknown node.</Panel>
  const step = steps[index]

  function advance(): void {
    audio.stop()
    if (index + 1 < steps.length) {
      setIndex(index + 1)
      return
    }
    // Decide the next screen from the current progress synchronously; the
    // updater below applies the same transition to whatever state is queued.
    const { completedSceneId } = completeNode(game.progress, course, nodeId)
    game.updateProgress((progress) => completeNode(progress, course, nodeId).progress)
    const events = [nodeCompleteEvent(game.eventContext, scene.id, nodeId)]
    if (completedSceneId) events.push(sceneCompleteEvent(game.eventContext, scene.id))
    game.appendEvents(events)
    if (completedSceneId) {
      audio.playSfx('scene-complete')
      game.navigate({ name: 'sceneComplete', sceneId: completedSceneId })
    } else {
      game.setBeat('advance')
      const next = course.nextNodeId(nodeId)
      game.navigate(next ? { name: 'teaching', nodeId: next } : { name: 'home' })
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="lesson-screen" data-node-id={nodeId} data-step-index={index}>
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>Scene {scene.order} · {node.title}</Eyebrow>
          <p className={cn('text-xs font-semibold', MUTED)} aria-live="polite">Question {Math.min(index + 1, steps.length)} of {steps.length}</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e6dfcf]" aria-hidden="true">
          <div className="h-full rounded-full bg-[#5d8a70] transition-[width] duration-300" style={{ width: `${steps.length ? (index / steps.length) * 100 : 0}%` }} />
        </div>
        {step?.kind === 'exercise' && (
          <LessonQuestion key={`${runId}-${step.id}`} exerciseId={step.id} nodeId={nodeId} sceneId={scene.id} onContinue={advance} />
        )}
        {step?.kind === 'construction' && (() => {
          const construction = course.constructionById.get(step.id)
          if (!construction) return null
          return (
            <ConstructionExercise
              key={`${runId}-${step.id}`}
              course={course}
              exercise={construction}
              showPinyin={game.settings.pinyinAssist === 'always'}
              onResolved={({ solved, orderedTileIds }) => {
                game.updateProgress((progress) => recordConstruction(progress, construction.id, solved))
                game.appendEvents([constructionEvent(game.eventContext, 'lesson', { sceneId: scene.id, nodeId, exerciseId: construction.id }, orderedTileIds)])
              }}
              onContinue={advance}
            />
          )
        })()}
        {!step && (
          <GameButton variant="primary" size="lg" onClick={advance}>Finish</GameButton>
        )}
      </Panel>
    </div>
  )
}

function LessonQuestion({ exerciseId, nodeId, sceneId, onContinue }: { exerciseId: string; nodeId: string; sceneId: string; onContinue: () => void }): ReactElement | null {
  const game = useGame()
  const exercise = game.course.exerciseById.get(exerciseId)
  if (!exercise) return null
  return <LessonQuestionInner exercise={exercise} nodeId={nodeId} sceneId={sceneId} onContinue={onContinue} />
}

function LessonQuestionInner({ exercise, nodeId, sceneId, onContinue }: { exercise: ChoiceExercise; nodeId: string; sceneId: string; onContinue: () => void }): ReactElement {
  const game = useGame()
  const { state, dispatch } = useAssessment(exercise, 'lesson', { sceneId, nodeId })
  return (
    <ListeningQuestion
      course={game.course}
      exercise={exercise}
      state={state}
      dispatch={dispatch}
      showPinyin={game.settings.pinyinAssist === 'always'}
      onContinue={() => {
        game.updateProgress((progress) => recordOpportunity(progress, summarizeOpportunity({ ...state, phase: 'resolved' }), nodeId))
        onContinue()
      }}
    />
  )
}
