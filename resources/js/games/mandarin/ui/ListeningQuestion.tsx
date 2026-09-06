/**
 * Audio → meaning multiple choice. Text stays hidden until the learner asks or
 * answers. Option order is fixed by the assessment state (shuffled once).
 * Help is recorded on the same opportunity, so a retry is never "unaided".
 */
import { Check, HelpCircle } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import type { AudioSourceRef } from '../contracts/mandarin'
import { type AssessmentAction, type AssessmentState, assistanceLabel, assistanceLevel, type HelpKind, lastAttempt } from '../domain/assessment'
import type { CourseIndex } from '../domain/course'
import type { ChoiceExercise } from '../domain/courseSchema'
import { Chip, GameButton, MUTED, SpokenText } from './primitives'
import { PromptPlayer } from './PromptPlayer'
import { useRuntime } from './RuntimeContext'

export interface ListeningQuestionProps {
  course: CourseIndex
  exercise: ChoiceExercise
  state: AssessmentState
  dispatch: (action: AssessmentAction) => void
  /** Checkpoint mode: no help before answering, no slow control. */
  strict?: boolean
  showPinyin: boolean
  onContinue: () => void
  continueLabel?: string
  /** Called once when the learner submits (answer / don't know / skip). */
  onResolved?: (state: AssessmentState) => void
}

function promptSources(exercise: ChoiceExercise): { normal: AudioSourceRef; slow: AudioSourceRef | null } {
  const first = exercise.promptAudio[0]
  if (!first) throw new Error(`Exercise ${exercise.id} has no prompt audio`)
  const normal: AudioSourceRef = { sourceKind: first.sourceKind, sourceId: first.sourceId, variant: 'normal' }
  const slow: AudioSourceRef | null = exercise.allowSlow ? { sourceKind: first.sourceKind, sourceId: first.sourceId, variant: 'slow' } : null
  return { normal, slow }
}

export function ListeningQuestion({ course, exercise, state, dispatch, strict = false, showPinyin, onContinue, continueLabel = 'Continue', onResolved }: ListeningQuestionProps): ReactElement {
  const { audio } = useRuntime()
  const { normal, slow } = promptSources(exercise)
  const spoken = course.sourceText(normal)
  const [helpOpen, setHelpOpen] = useState(false)
  const feedback = state.phase !== 'listening'
  const attempt = lastAttempt(state)
  const correct = attempt?.correct === true
  const level = assistanceLevel(state)
  const options = state.optionOrder
    .map((optionId) => exercise.options.find((option) => option.id === optionId))
    .filter((option) => option !== undefined)

  function reveal(kind: HelpKind): void {
    dispatch({ type: 'reveal', kind })
    setHelpOpen(true)
  }

  function submit(action: 'submit' | 'dontKnow' | 'skip'): void {
    audio.stop()
    dispatch({ type: action })
    if (action === 'submit' && state.selectedOptionId === exercise.correctOptionId) audio.playSfx('answer-correct')
    else audio.playSfx('answer-help')
    onResolved?.(state)
  }

  const transcriptVisible = state.helpRevealed.includes('transcript') || feedback
  const pinyinVisible = state.helpRevealed.includes('pinyin') || (feedback && showPinyin)

  return (
    <div className="flex flex-col gap-4" data-testid="listening-question" data-exercise-id={exercise.id} data-phase={state.phase}>
      <div>
        <p className="text-base font-semibold sm:text-lg">{exercise.question}</p>
        <p className={cn('text-sm', MUTED)}>Listen first. The words stay hidden until you answer{strict ? '.' : ' or ask for help.'}</p>
      </div>

      <PromptPlayer
        source={normal}
        slowSource={strict ? null : slow}
        onPlayback={(variant, outcome) => dispatch({ type: 'playback', variant, outcome })}
        playLabel="Play"
      />

      {spoken && transcriptVisible && (
        <div className="rounded-xl border border-[#e2dccd] bg-[#faf7f0] p-3" data-testid="transcript">
          <SpokenText zh={spoken.zh} pinyin={spoken.pinyin} en={feedback ? spoken.en : '(meaning hidden until you answer)'} showPinyin={pinyinVisible} size="md" />
        </div>
      )}
      {spoken && !transcriptVisible && pinyinVisible && (
        <p lang="zh-Latn-pinyin" className={cn('text-base', MUTED)} data-testid="pinyin-help">{spoken.pinyin}</p>
      )}

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={feedback} aria-describedby={`${exercise.id}-hint`}>
        <legend className="sr-only">Choose the meaning</legend>
        {options.map((option, index) => {
          const selected = state.selectedOptionId === option.id
          const submitted = state.submittedOptionId === option.id
          const isCorrect = feedback && option.id === exercise.correctOptionId
          const isWrong = feedback && submitted && !isCorrect
          return (
            <GameButton
              key={option.id}
              variant="choice"
              size="lg"
              block
              role="radio"
              aria-checked={selected}
              data-option-id={option.id}
              data-testid="answer-option"
              onClick={() => {
                audio.playSfx('ui-tap')
                dispatch({ type: 'select', optionId: option.id })
              }}
              className={cn(
                selected && !feedback && 'border-[#5d8a70] ring-2 ring-[#5d8a70]/40',
                isCorrect && 'border-[#5d8a70] bg-[#e4efe8]',
                isWrong && 'border-[#c98a8a] bg-[#fbeaea]',
              )}
            >
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold', selected ? 'border-[#5d8a70] bg-[#5d8a70] text-white' : 'border-[#cfd6d1] text-[#5b6470]')} aria-hidden="true">
                {isCorrect ? <Check className="size-4" /> : index + 1}
              </span>
              <span>{option.label}</span>
            </GameButton>
          )
        })}
        <p id={`${exercise.id}-hint`} className="sr-only">Three choices. Pick one, then press Check.</p>
      </fieldset>

      {!feedback && (
        <div className="flex flex-wrap items-center gap-2">
          <GameButton variant="primary" size="lg" onClick={() => submit('submit')} disabled={!state.selectedOptionId} data-testid="check-answer">
            Check
          </GameButton>
          <GameButton variant="secondary" size="lg" onClick={() => submit('dontKnow')} data-testid="dont-know">
            I don't know
          </GameButton>
          {!strict && (
            <GameButton variant="quiet" size="md" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen} data-testid="help-toggle">
              <HelpCircle aria-hidden="true" className="size-5" />
              Help
            </GameButton>
          )}
        </div>
      )}

      {!feedback && !strict && helpOpen && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[#ead7a4] bg-[#fbf3df] p-3" data-testid="help-panel">
          <p className="w-full text-xs text-[#5c4510]">Help is fine. It is recorded with this question, so the answer counts as assisted.</p>
          <GameButton variant="secondary" onClick={() => reveal('pinyin')} disabled={state.helpRevealed.includes('pinyin')}>Show pinyin</GameButton>
          {exercise.allowTextHelp && (
            <GameButton variant="secondary" onClick={() => reveal('transcript')} disabled={state.helpRevealed.includes('transcript')}>Show the characters</GameButton>
          )}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          data-testid="feedback"
          className={cn('rounded-xl border p-3', correct ? 'border-[#bfd8c9] bg-[#e4efe8]' : 'border-[#ead7a4] bg-[#fbf3df]')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">
              {attempt?.action === 'dont_know' ? 'No problem. Here is the answer.' : attempt?.action === 'skip' ? 'Skipped.' : correct ? 'That’s it.' : 'Not this time.'}
            </p>
            <Chip tone={level === 'unaided' ? 'jade' : level === 'unscored' ? 'neutral' : 'amber'} data-testid="assistance-chip">{assistanceLabel(level)}</Chip>
          </div>
          <p className="mt-1 text-sm">{exercise.explanation}</p>
          {state.attempts.length > 1 && <p className={cn('mt-1 text-xs', MUTED)}>Retry after feedback counts as practice, not a fresh attempt.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!correct && attempt?.action === 'answer' && state.phase === 'feedback' && (
              <GameButton variant="secondary" size="lg" onClick={() => { dispatch({ type: 'retry' }); setHelpOpen(false) }} data-testid="retry-question">
                Try again
              </GameButton>
            )}
            <GameButton variant="primary" size="lg" onClick={() => { dispatch({ type: 'finish' }); onContinue() }} data-testid="continue">
              {continueLabel}
            </GameButton>
          </div>
        </div>
      )}
    </div>
  )
}
