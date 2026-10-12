/** Builds contract-shaped practice events from UI state. The gateway decides correctness. */
import type { AudioSourceRef, CourseIdentity, PracticeEvent } from '../contracts/mandarin'
import { type AssessmentState, audioEvidence, lastAttempt } from './assessment'
import { uuid } from './random'

export interface EventContext {
  identity: CourseIdentity
  clientInstanceId: string
  sessionId: string
  schemaVersion?: 1 | 2
  sessionKind?: 'scheduled' | 'continuation' | 'extra'
  now: () => string
}

type Base = Pick<PracticeEvent, 'kind' | 'mode' | 'sceneId' | 'nodeId' | 'exerciseId' | 'opportunityId'>

function base(context: EventContext, fields: Base): PracticeEvent {
  return {
    ...context.identity,
    schemaVersion: context.schemaVersion ?? 1,
    clientEventId: uuid(),
    clientInstanceId: context.clientInstanceId,
    sessionId: context.sessionId,
    clientOccurredAt: context.now(),
    source: null,
    responseAction: null,
    selectedOptionId: null,
    orderedTileIds: null,
    textHelpUsed: false,
    pinyinHelpUsed: false,
    audioEvidence: { status: 'not_required', normalPlayCount: 0, slowPlayCount: 0, interrupted: false },
    ...fields,
  }
}

export function responseEvent(
  context: EventContext,
  state: AssessmentState,
  location: { sceneId: string | null; nodeId: string | null },
  source: AudioSourceRef | null,
): PracticeEvent {
  const attempt = lastAttempt(state)
  const v2 = context.schemaVersion === 2
  return {
    ...base(context, {
      kind: 'response',
      mode: state.mode,
      sceneId: location.sceneId,
      nodeId: location.nodeId,
      exerciseId: state.exerciseId,
      opportunityId: state.opportunityId,
    }),
    source,
    ...(v2 ? {
      attemptIndex: Math.max(0, state.attempts.length - 1),
      selfRating: null,
      sessionKind: state.mode === 'review' ? context.sessionKind ?? 'scheduled' : state.mode === 'extra_practice' ? 'extra' : null,
    } : {}),
    responseAction: attempt?.action ?? null,
    selectedOptionId: attempt?.optionId ?? null,
    // V1 treats a retry after feedback as text help; v2 records attemptIndex
    // separately. Read the retry from the attempt, not from `state.answerDisclosed`
    // — submitting sets that flag itself, so the post-action state reports every
    // first answer as assisted and the scheduler never sees an unaided success.
    textHelpUsed: state.helpRevealed.includes('transcript') || state.helpRevealed.includes('meaning') || (!v2 && attempt?.isRetry === true),
    pinyinHelpUsed: state.helpRevealed.includes('pinyin'),
    audioEvidence: audioEvidence(state),
  }
}

export function helpRevealedEvent(context: EventContext, state: AssessmentState, location: { sceneId: string | null; nodeId: string | null }): PracticeEvent {
  return {
    ...base(context, {
      kind: 'help_revealed',
      mode: state.mode,
      sceneId: location.sceneId,
      nodeId: location.nodeId,
      exerciseId: state.exerciseId,
      opportunityId: state.opportunityId,
    }),
    // Keep v1's historical meaning; v2 counts only actual text reveals.
    textHelpUsed: state.helpRevealed.includes('transcript') || state.helpRevealed.includes('meaning') || (context.schemaVersion !== 2 && state.answerDisclosed),
    pinyinHelpUsed: state.helpRevealed.includes('pinyin'),
    audioEvidence: audioEvidence(state),
  }
}

export function constructionEvent(
  context: EventContext,
  mode: PracticeEvent['mode'],
  location: { sceneId: string; nodeId: string; exerciseId: string },
  orderedTileIds: string[],
  /** True once a derived hint or the revealed order has been shown. */
  assisted = false,
): PracticeEvent {
  return {
    ...base(context, { kind: 'response', mode, ...location, opportunityId: context.schemaVersion === 2 ? uuid() : null }),
    ...(context.schemaVersion === 2 ? { attemptIndex: 0, selfRating: null, sessionKind: mode === 'review' ? context.sessionKind ?? 'scheduled' : mode === 'extra_practice' ? 'extra' : null } : {}),
    responseAction: 'answer',
    orderedTileIds,
    // Construction is excluded from listening scheduling either way, but the
    // record should still say whether the learner built this unaided.
    textHelpUsed: assisted,
  }
}

export function teachingExposureEvent(context: EventContext, sceneId: string, nodeId: string): PracticeEvent {
  return base(context, { kind: 'teaching_exposure', mode: 'lesson', sceneId, nodeId, exerciseId: null, opportunityId: null })
}

export function nodeCompleteEvent(context: EventContext, sceneId: string, nodeId: string): PracticeEvent {
  return base(context, { kind: 'node_complete', mode: 'lesson', sceneId, nodeId, exerciseId: null, opportunityId: null })
}

export function sceneCompleteEvent(context: EventContext, sceneId: string): PracticeEvent {
  return base(context, { kind: 'scene_complete', mode: 'lesson', sceneId, nodeId: null, exerciseId: null, opportunityId: null })
}

export function checkpointExposureEvent(context: EventContext, exerciseId: string, opportunityId: string): PracticeEvent {
  return base(context, { kind: 'checkpoint_exposure', mode: 'checkpoint', sceneId: null, nodeId: null, exerciseId, opportunityId })
}
