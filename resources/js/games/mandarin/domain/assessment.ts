/**
 * Pure state machine for one listening opportunity (prompt → hints/replays →
 * answer → feedback → retry). One opportunity ID covers every retry of the same
 * question, so an immediate retry after the explanation is never mistaken for
 * a fresh unaided attempt. Components dispatch actions; nothing here touches
 * audio, storage or the network.
 */
import type { AudioEvidence, PracticeEvent } from '../contracts/mandarin'
import type { ChoiceExercise } from './courseSchema'
import { seededShuffle } from './random'

export type HelpKind = 'transcript' | 'pinyin' | 'meaning'
export type PlaybackOutcome = 'completed' | 'interrupted' | 'failed' | 'blocked' | 'simulated' | 'unavailable'
export type ResponseAction = NonNullable<PracticeEvent['responseAction']>
export type AssessmentMode = PracticeEvent['mode']

/**
 * How much support the learner had when they answered. `unscored` means no
 * real Mandarin audio completed before the answer (preview without audio,
 * failed playback), so the result is not evidence of listening either way.
 */
export type AssistanceLevel = 'unaided' | 'replay' | 'slow' | 'text' | 'unscored'

export interface AssessmentAttempt {
  action: ResponseAction
  optionId: string | null
  correct: boolean | null
  assistance: AssistanceLevel
  /** True when this attempt came after feedback on an earlier attempt. */
  isRetry: boolean
}

export interface AssessmentState {
  opportunityId: string
  exerciseId: string
  mode: AssessmentMode
  /** Shuffled once when the opportunity is created; stable across rerenders and retries. */
  optionOrder: readonly string[]
  phase: 'listening' | 'feedback' | 'resolved'
  selectedOptionId: string | null
  /** The option that was actually submitted for the current feedback panel. */
  submittedOptionId: string | null
  helpRevealed: readonly HelpKind[]
  normalPlayCount: number
  slowPlayCount: number
  completedPlayCount: number
  simulatedPlayCount: number
  failedPlayCount: number
  interrupted: boolean
  attempts: readonly AssessmentAttempt[]
}

export type AssessmentAction =
  | { type: 'playback'; variant: 'normal' | 'slow'; outcome: PlaybackOutcome }
  | { type: 'reveal'; kind: HelpKind }
  | { type: 'select'; optionId: string }
  | { type: 'submit' }
  | { type: 'dontKnow' }
  | { type: 'skip' }
  | { type: 'retry' }
  | { type: 'finish' }

export function createAssessment(
  exercise: Pick<ChoiceExercise, 'id' | 'options' | 'shuffleOptions'>,
  opportunityId: string,
  mode: AssessmentMode,
): AssessmentState {
  const optionIds = exercise.options.map((option) => option.id)
  return {
    opportunityId,
    exerciseId: exercise.id,
    mode,
    optionOrder: exercise.shuffleOptions ? seededShuffle(optionIds, opportunityId) : optionIds,
    phase: 'listening',
    selectedOptionId: null,
    submittedOptionId: null,
    helpRevealed: [],
    normalPlayCount: 0,
    slowPlayCount: 0,
    completedPlayCount: 0,
    simulatedPlayCount: 0,
    failedPlayCount: 0,
    interrupted: false,
    attempts: [],
  }
}

/** Assistance the learner has had so far in this opportunity. */
export function assistanceLevel(state: AssessmentState): AssistanceLevel {
  if (state.completedPlayCount === 0) return 'unscored'
  if (state.helpRevealed.length > 0) return 'text'
  if (state.slowPlayCount > 0) return 'slow'
  if (state.normalPlayCount > 1) return 'replay'
  return 'unaided'
}

export function assistanceLabel(level: AssistanceLevel): string {
  switch (level) {
    case 'unaided': return 'Unaided, first listen'
    case 'replay': return 'With a replay'
    case 'slow': return 'With slower audio'
    case 'text': return 'With text help'
    case 'unscored': return 'Not scored: no Mandarin audio completed'
  }
}

export function audioEvidence(state: AssessmentState): AudioEvidence {
  const status: AudioEvidence['status'] = state.completedPlayCount > 0
    ? 'completed'
    : state.simulatedPlayCount > 0
      ? 'simulated'
      : state.failedPlayCount > 0
        ? 'failed'
        : 'skipped'
  return {
    status,
    normalPlayCount: state.normalPlayCount,
    slowPlayCount: state.slowPlayCount,
    interrupted: state.interrupted,
  }
}

export function firstAttempt(state: AssessmentState): AssessmentAttempt | null {
  return state.attempts[0] ?? null
}

export function lastAttempt(state: AssessmentState): AssessmentAttempt | null {
  return state.attempts[state.attempts.length - 1] ?? null
}

export function helpUsed(state: AssessmentState): boolean {
  return state.helpRevealed.length > 0 || state.slowPlayCount > 0 || state.normalPlayCount > 1
}

export function reduceAssessment(
  state: AssessmentState,
  action: AssessmentAction,
  correctOptionId: string,
): AssessmentState {
  switch (action.type) {
    case 'playback': {
      const next = { ...state }
      if (action.outcome === 'completed') {
        next.completedPlayCount += 1
        if (action.variant === 'slow') next.slowPlayCount += 1
        else next.normalPlayCount += 1
      } else if (action.outcome === 'simulated') {
        next.simulatedPlayCount += 1
      } else if (action.outcome === 'interrupted') {
        next.interrupted = true
      } else if (action.outcome === 'failed' || action.outcome === 'unavailable') {
        next.failedPlayCount += 1
      }
      // `blocked` (autoplay refused) changes nothing: the learner gets a fresh Play control.
      return next
    }
    case 'reveal':
      if (state.helpRevealed.includes(action.kind)) return state
      return { ...state, helpRevealed: [...state.helpRevealed, action.kind] }
    case 'select':
      if (state.phase !== 'listening') return state
      return { ...state, selectedOptionId: action.optionId }
    case 'submit': {
      if (state.phase !== 'listening' || state.selectedOptionId === null) return state
      const correct = state.selectedOptionId === correctOptionId
      return {
        ...state,
        phase: 'feedback',
        submittedOptionId: state.selectedOptionId,
        attempts: [...state.attempts, {
          action: 'answer',
          optionId: state.selectedOptionId,
          correct,
          assistance: assistanceLevel(state),
          isRetry: state.attempts.length > 0,
        }],
      }
    }
    case 'dontKnow':
      if (state.phase !== 'listening') return state
      return {
        ...state,
        phase: 'feedback',
        submittedOptionId: null,
        attempts: [...state.attempts, {
          action: 'dont_know',
          optionId: null,
          correct: null,
          assistance: assistanceLevel(state),
          isRetry: state.attempts.length > 0,
        }],
      }
    case 'skip':
      if (state.phase === 'resolved') return state
      return {
        ...state,
        phase: 'resolved',
        attempts: [...state.attempts, {
          action: 'skip',
          optionId: null,
          correct: null,
          assistance: assistanceLevel(state),
          isRetry: state.attempts.length > 0,
        }],
      }
    case 'retry':
      if (state.phase !== 'feedback') return state
      // Hints, replays and the attempt history survive: this is the same opportunity.
      return { ...state, phase: 'listening', selectedOptionId: null, submittedOptionId: null }
    case 'finish':
      return { ...state, phase: 'resolved' }
  }
}

/** Outcome summary used by progress + scene summaries. */
export interface OpportunityOutcome {
  opportunityId: string
  exerciseId: string
  mode: AssessmentMode
  firstAttempt: AssessmentAttempt | null
  attempts: number
  resolvedCorrect: boolean
  helpUsed: boolean
  finalAssistance: AssistanceLevel
  evidence: AudioEvidence
}

export function summarizeOpportunity(state: AssessmentState): OpportunityOutcome {
  const last = lastAttempt(state)
  return {
    opportunityId: state.opportunityId,
    exerciseId: state.exerciseId,
    mode: state.mode,
    firstAttempt: firstAttempt(state),
    attempts: state.attempts.length,
    resolvedCorrect: last?.correct === true,
    helpUsed: helpUsed(state),
    finalAssistance: assistanceLevel(state),
    evidence: audioEvidence(state),
  }
}
