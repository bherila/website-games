/**
 * Ten reserved items, available only after the course. Normal speed first, no
 * subtitles before answering, help only after answering, fresh vs repeat
 * exposure tracked per item. Makes no learning or voice-transfer claim.
 */
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { assistanceLevel, lastAttempt } from '../../domain/assessment'
import type { ChoiceExercise } from '../../domain/courseSchema'
import { checkpointExposureEvent } from '../../domain/events'
import { isCheckpointUnlocked, markCheckpointExposed, recordCheckpointResult } from '../../domain/progress'
import { useGame } from '../GameContext'
import { ListeningQuestion } from '../ListeningQuestion'
import { PreviewBanner } from '../PreviewBanner'
import { Chip, Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'
import { useRuntime } from '../RuntimeContext'
import { useAssessment } from '../useAssessment'

export function ListeningCheckScreen(): ReactElement {
  const game = useGame()
  const { audio } = useRuntime()
  const { course, progress } = game
  const unlocked = isCheckpointUnlocked(progress, course)
  const items = useMemo(() => [...course.checkpointById.values()], [course])
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<{ fresh: boolean; correct: boolean | null }[]>([])
  const item = items[index]
  const done = started && index >= items.length
  const freshCount = useMemo(() => items.filter((entry) => !progress.checkpoint.exposedExerciseIds.includes(entry.id)).length, [items, progress.checkpoint.exposedExerciseIds])

  useEffect(() => {
    game.setBeat('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (started && unlocked) audio.ensure(items.flatMap((entry) => entry.promptAudio.map((ref) => ({ ...ref }))))
  }, [audio, items, started, unlocked])

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-3" data-testid="listening-check-screen" data-check-state="locked">
        <PreviewBanner compact />
        <Panel className="flex flex-col gap-3">
          <Eyebrow>Listening check</Eyebrow>
          <SectionTitle>Not yet.</SectionTitle>
          <p className={cn('text-sm', MUTED)}>The listening check opens after the last scene. It uses ten lines you have not heard in the story, so nothing from it is shown early.</p>
          <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="listening-check-screen" data-check-state={done ? 'completed' : started ? 'running' : 'intro'}>
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Eyebrow>After the story</Eyebrow>
            <SectionTitle>Listening check</SectionTitle>
          </div>
          <Chip tone={freshCount === items.length ? 'jade' : freshCount === 0 ? 'neutral' : 'amber'} data-testid="fresh-chip">
            {freshCount === items.length ? 'All 10 items are new to you' : freshCount === 0 ? 'Repeat · you have heard all 10 before' : `${freshCount} new · ${items.length - freshCount} repeat`}
          </Chip>
        </div>

        {!started && (
          <div className="flex flex-col gap-2">
            <p>Ten short lines, each played once at normal speed. Pick the meaning. No subtitles or hints until you answer. Replays are allowed and recorded.</p>
            <p className={cn('text-sm', MUTED)}>This checks whether you can follow these particular lines today. It is not a certificate, and it says nothing about other speakers or voices.</p>
            <div className="flex flex-wrap gap-2">
              <GameButton variant="primary" size="lg" onClick={() => setStarted(true)} data-testid="start-check">Start</GameButton>
              <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Not now</GameButton>
            </div>
          </div>
        )}

        {started && item && !done && (
          <>
            <p className={cn('text-xs font-semibold', MUTED)} aria-live="polite">{index + 1} of {items.length}</p>
            <CheckpointQuestion
              key={item.id}
              exercise={item}
              onDone={(result) => {
                audio.stop()
                setResults((current) => [...current, result])
                setIndex(index + 1)
              }}
            />
          </>
        )}

        {done && (
          <div className="flex flex-col gap-2" data-testid="check-complete">
            <p className="font-bold">Finished.</p>
            <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <Stat label="Answered" value={results.length} />
              <Stat label="Correct" value={results.filter((r) => r.correct === true).length} />
              <Stat label="Correct on first hearing" value={results.filter((r) => r.fresh && r.correct === true).length} />
              <Stat label="Repeat items" value={results.filter((r) => !r.fresh).length} />
            </dl>
            <p className={cn('text-sm', MUTED)}>Only first-time items count as fresh exposure. Repeats are shown separately and are not evidence of new learning.</p>
            <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="rounded-xl bg-[#faf7f0] p-2">
      <dt className={cn('text-xs', MUTED)}>{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
    </div>
  )
}

function CheckpointQuestion({ exercise, onDone }: { exercise: ChoiceExercise; onDone: (result: { fresh: boolean; correct: boolean | null }) => void }): ReactElement {
  const game = useGame()
  const { state, dispatch } = useAssessment(exercise, 'checkpoint', { sceneId: null, nodeId: null })
  // Captured once: the exposure effect below marks the item as seen immediately.
  const [fresh] = useState(() => !game.progress.checkpoint.exposedExerciseIds.includes(exercise.id))

  useEffect(() => {
    game.updateProgress((progress) => markCheckpointExposed(progress, exercise.id))
    game.appendEvents([checkpointExposureEvent(game.eventContext, exercise.id, state.opportunityId)])
    // Exposure is recorded once when the item is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id])

  return (
    <div className="flex flex-col gap-2">
      <Chip tone={fresh ? 'jade' : 'neutral'} className="self-start" data-testid="exposure-chip">{fresh ? 'First time you hear this line' : 'You have heard this line before'}</Chip>
      <ListeningQuestion
        course={game.course}
        exercise={exercise}
        state={state}
        dispatch={dispatch}
        strict
        showPinyin={false}
        continueLabel="Next"
        onContinue={() => {
          const attempt = lastAttempt(state)
          game.updateProgress((progress) => recordCheckpointResult(progress, {
            exerciseId: exercise.id,
            correct: attempt?.correct ?? null,
            assistance: assistanceLevel(state),
            replays: Math.max(0, state.normalPlayCount - 1),
          }))
          onDone({ fresh, correct: attempt?.correct ?? null })
        }}
      />
    </div>
  )
}
