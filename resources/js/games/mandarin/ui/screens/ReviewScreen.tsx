/**
 * Bounded review session (≤10) from the mock due list, or visibly-separate
 * extra practice. Empty / loaded / completed / backlogged states.
 */
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { summarizeOpportunity } from '../../domain/assessment'
import type { ChoiceExercise } from '../../domain/courseSchema'
import { recordOpportunity, recordReviewSessionComplete } from '../../domain/progress'
import { buildExtraPractice, buildScheduledReview, REVIEW_SESSION_LIMIT, type ReviewPlan } from '../../domain/reviewSession'
import { useGame } from '../GameContext'
import { ListeningQuestion } from '../ListeningQuestion'
import { PreviewBanner } from '../PreviewBanner'
import { Chip, Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'
import { useRuntime } from '../RuntimeContext'
import { useAssessment } from '../useAssessment'

export function ReviewScreen({ kind }: { kind: 'scheduled' | 'extra' }): ReactElement {
  const game = useGame()
  const { audio } = useRuntime()
  const { course, progress, projection } = game
  const [seed] = useState(() => `${Date.now()}`)
  const plan = useMemo<ReviewPlan>(() => kind === 'scheduled'
    ? buildScheduledReview(course, progress, projection?.dueTargetIds ?? [])
    : buildExtraPractice(course, progress, seed),
  // The plan is built once per visit; later progress updates must not reshuffle it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [kind, seed])
  const [index, setIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const done = index >= plan.items.length
  const item = plan.items[index]
  const taughtAnything = progress.completedNodeIds.length > 0

  useEffect(() => {
    game.setBeat('idle')
    audio.ensure(plan.items.flatMap((entry) => {
      const ref = entry.exercise.promptAudio[0]
      return ref ? [{ ...ref }, { ...ref, variant: 'slow' as const }] : []
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  useEffect(() => {
    if (done && plan.items.length > 0 && kind === 'scheduled') {
      game.updateProgress((current) => recordReviewSessionComplete(current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const title = kind === 'scheduled' ? 'Review' : 'Extra practice'
  const state = plan.items.length === 0 ? 'empty' : done ? 'completed' : plan.backlog > 0 ? 'backlogged' : 'loaded'

  return (
    <div className="flex flex-col gap-3" data-testid="review-screen" data-review-kind={kind} data-review-state={state}>
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Eyebrow>{kind === 'scheduled' ? 'Scheduled by the mock due list' : 'Not scheduled · does not change your review plan'}</Eyebrow>
            <SectionTitle>{title}</SectionTitle>
          </div>
          <Chip tone={kind === 'scheduled' ? 'slate' : 'amber'}>{kind === 'scheduled' ? 'Review' : 'Extra practice'}</Chip>
        </div>

        {state === 'empty' && (
          <div className="flex flex-col gap-2" data-testid="review-empty">
            <p>{!taughtAnything ? 'Finish your first lesson to unlock review.' : kind === 'scheduled' ? 'Nothing is due right now. Come back after your next lesson, or do a short round of extra practice.' : 'Nothing to practise yet.'}</p>
            <div className="flex flex-wrap gap-2">
              {kind === 'scheduled' && taughtAnything && (
                <GameButton variant="primary" size="lg" onClick={() => game.navigate({ name: 'review', kind: 'extra' })}>Extra practice instead</GameButton>
              )}
              <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
            </div>
          </div>
        )}

        {(state === 'loaded' || state === 'backlogged') && item && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs font-semibold', MUTED)} aria-live="polite">{index + 1} of {plan.items.length}</p>
              {plan.backlog > 0 && (
                <p className={cn('text-xs', MUTED)} data-testid="review-backlog">{plan.backlog} more due after this session (sessions stop at {REVIEW_SESSION_LIMIT}).</p>
              )}
            </div>
            <ReviewQuestion
              key={`${index}-${item.exercise.id}`}
              exercise={item.exercise}
              mode={kind === 'scheduled' ? 'review' : 'extra_practice'}
              onDone={(correct) => {
                audio.stop()
                if (correct) setCorrectCount((count) => count + 1)
                setIndex(index + 1)
              }}
            />
          </>
        )}

        {state === 'completed' && (
          <div className="flex flex-col gap-2" data-testid="review-complete">
            <p className="font-bold">Session finished.</p>
            <p className={cn('text-sm', MUTED)}>{correctCount} of {plan.items.length} resolved correctly. {kind === 'scheduled' ? 'The mock scheduler will pick the next due set; the real one arrives with the live adapter.' : 'Extra practice is logged but does not move any review dates.'}</p>
            {plan.backlog > 0 && <p className={cn('text-sm', MUTED)}>{plan.backlog} items are still due.</p>}
            <div className="flex flex-wrap gap-2">
              {plan.backlog > 0 && <GameButton variant="primary" size="lg" onClick={() => { setIndex(0); setCorrectCount(0) }}>Another session</GameButton>}
              <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}

function ReviewQuestion({ exercise, mode, onDone }: { exercise: ChoiceExercise; mode: 'review' | 'extra_practice'; onDone: (correct: boolean) => void }): ReactElement {
  const game = useGame()
  const { state, dispatch } = useAssessment(exercise, mode, { sceneId: exercise.sceneId, nodeId: exercise.nodeId })
  return (
    <ListeningQuestion
      course={game.course}
      exercise={exercise}
      state={state}
      dispatch={dispatch}
      showPinyin={game.settings.pinyinAssist === 'always'}
      continueLabel="Next"
      onContinue={() => {
        const outcome = summarizeOpportunity({ ...state, phase: 'resolved' })
        game.updateProgress((progress) => recordOpportunity(progress, outcome, exercise.nodeId))
        onDone(outcome.resolvedCorrect)
      }}
    />
  )
}
