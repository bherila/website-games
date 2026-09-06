/** Builds contract-shaped practice events from UI state. The gateway decides correctness. */
import type { AudioSourceRef, CourseIdentity, PracticeEvent } from '../contracts/mandarin'
import { type AssessmentState, audioEvidence, lastAttempt } from './assessment'
import { uuid } from './random'

export interface EventContext {
  identity: CourseIdentity
  clientInstanceId: string
  sessionId: string
  now: () => string
}

type Base = Pick<PracticeEvent, 'kind' | 'mode' | 'sceneId' | 'nodeId' | 'exerciseId' | 'opportunityId'>

function base(context: EventContext, fields: Base): PracticeEvent {
  return {
    ...context.identity,
    schemaVersion: 1,
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
    responseAction: attempt?.action ?? null,
    selectedOptionId: attempt?.optionId ?? null,
    textHelpUsed: state.helpRevealed.includes('transcript') || state.helpRevealed.includes('meaning'),
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
    textHelpUsed: state.helpRevealed.includes('transcript') || state.helpRevealed.includes('meaning'),
    pinyinHelpUsed: state.helpRevealed.includes('pinyin'),
    audioEvidence: audioEvidence(state),
  }
}

export function constructionEvent(
  context: EventContext,
  mode: PracticeEvent['mode'],
  location: { sceneId: string; nodeId: string; exerciseId: string },
  orderedTileIds: string[],
): PracticeEvent {
  return {
    ...base(context, { kind: 'response', mode, ...location, opportunityId: null }),
    responseAction: 'answer',
    orderedTileIds,
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
