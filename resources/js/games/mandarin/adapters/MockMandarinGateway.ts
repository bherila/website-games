/**
 * In-memory implementation of `MandarinGateway` for the preview build.
 *
 * Honest by construction: speech never reaches `ready` here because the mock
 * has no real Mandarin asset to point at. Audio sources resolve to the
 * contract's explicit non-live `preview` state (or to queued / generating /
 * failed / unavailable when a scenario asks for that transition). Codex
 * replaces this class with an HTTP adapter over the proposed
 * `/api/games/mandarin/*` routes; the UI only sees the interface.
 */
import type {
  AppendResult,
  AudioBatchRequest,
  AudioBatchResponse,
  AudioResolution,
  AudioSourceRef,
  Bootstrap,
  EventAcknowledgment,
  MandarinGateway,
  PracticeEvent,
  ProgressProjection,
} from '../contracts/mandarin'
import type { CourseIndex } from '../domain/course'
import { sourceKey } from '../domain/course'
import type { Course } from '../domain/courseSchema'
import type { PreviewScenario } from './previewScenarios'

export interface MockGatewayOptions {
  now?: () => Date
  /** Override the scenario's append delay (tests pass 0). */
  appendDelayMs?: number
  /** Node IDs the mock treats as completed before any events (returning learner). */
  seedCompletedNodeIds?: readonly string[]
}

export const MOCK_POLL_URL_PREFIX = '/api/games/mandarin/audio/requests/'
const POLL_RETRY_MS = 1200

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    }
    return item
  })
}

export class MockMandarinGateway implements MandarinGateway<Course> {
  private readonly events = new Map<string, { payload: string; sequence: number }>()
  private sequence = 0
  private readonly completedNodeIds: Set<string>
  private readonly checkpointExposed = new Set<string>()
  private readonly pendingRequests = new Map<string, { source: AudioSourceRef; polls: number }>()
  private readonly resolveAttempts = new Map<string, number>()
  private readonly now: () => Date
  private readonly appendDelayMs: number

  constructor(
    private readonly course: CourseIndex,
    readonly scenario: PreviewScenario,
    options: MockGatewayOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.appendDelayMs = options.appendDelayMs ?? scenario.appendDelayMs
    this.completedNodeIds = new Set(options.seedCompletedNodeIds ?? [])
  }

  /** Preview reset: forget everything this mock accumulated, including seeded progress. */
  reset(): void {
    this.events.clear()
    this.sequence = 0
    this.completedNodeIds.clear()
    this.checkpointExposed.clear()
    this.pendingRequests.clear()
    this.resolveAttempts.clear()
  }

  async bootstrap(): Promise<Bootstrap<Course>> {
    return {
      runtime: 'preview',
      course: this.course.course,
      account: { ...this.scenario.account },
      capabilities: { ...this.scenario.capabilities },
      audio: { ...this.course.identity, results: [] },
      serverTime: this.now().toISOString(),
    }
  }

  async resolveAudio(request: AudioBatchRequest, signal?: AbortSignal): Promise<AudioBatchResponse> {
    this.assertIdentity(request)
    if (request.sources.length > 16) {
      throw new Error('resolveAudio accepts at most 16 sources')
    }
    if (this.scenario.audio === 'networkError') {
      throw new TypeError('Failed to fetch')
    }
    await delay(0)
    signal?.throwIfAborted()
    return {
      ...this.course.identity,
      results: request.sources.map((source) => this.resolveOne(source)),
    }
  }

  async pollAudio(requestId: string, signal?: AbortSignal): Promise<AudioResolution> {
    if (this.scenario.audio === 'networkError') {
      throw new TypeError('Failed to fetch')
    }
    await delay(0)
    signal?.throwIfAborted()
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      throw new Error(`Unknown audio request ${requestId}`)
    }
    pending.polls += 1
    const { source } = pending
    switch (this.scenario.audio) {
      case 'queued':
        return this.queued(source, requestId, 'queued')
      case 'generating':
        return this.queued(source, requestId, 'generating')
      case 'progress':
        if (pending.polls === 1) return this.queued(source, requestId, 'generating')
        this.pendingRequests.delete(requestId)
        return this.preview(source, 'Mock stand-in: the live gateway returns a ready asset URL at this step.')
      default:
        this.pendingRequests.delete(requestId)
        return this.preview(source)
    }
  }

  async getProgress(): Promise<ProgressProjection> {
    const completedNodeIds = [...this.completedNodeIds]
    const completedSceneIds = this.course.scenes
      .filter((scene) => scene.nodeIds.every((nodeId) => this.completedNodeIds.has(nodeId)))
      .map((scene) => scene.id)
    const lastCompleted = this.course.nodes.filter((node) => this.completedNodeIds.has(node.id)).at(-1)
    const currentNodeId = lastCompleted ? this.course.nextNodeId(lastCompleted.id) ?? lastCompleted.id : this.course.nodes[0]!.id
    return {
      ...this.course.identity,
      lastSequence: this.sequence,
      completedNodeIds,
      completedSceneIds,
      currentNodeId,
      dueTargetIds: [...this.scenario.dueTargetIds],
      checkpointExposedIds: [...this.checkpointExposed],
      schedulerVersion: 'mock-preview-0',
      schedulerConfigHash: 'mock',
      listeningCards: {},
    }
  }

  async appendEvents(events: PracticeEvent[], signal?: AbortSignal): Promise<AppendResult> {
    if (this.scenario.appendBehavior === 'networkError') {
      throw new TypeError('Failed to fetch')
    }
    if (events.length > 64) {
      throw new Error('appendEvents accepts at most 64 events per batch')
    }
    await delay(this.appendDelayMs)
    signal?.throwIfAborted()
    const acknowledgments: EventAcknowledgment[] = events.map((event) => {
      if (this.scenario.appendBehavior === 'signInRequired') {
        return this.reject(event, 'sign_in_required')
      }
      if (event.courseId !== this.course.identity.courseId || event.contentVersion !== this.course.identity.contentVersion) {
        return this.reject(event, 'unknown_course_revision')
      }
      const payload = stableStringify(event)
      const existing = this.events.get(event.clientEventId)
      if (existing) {
        return existing.payload === payload
          ? { ...this.accept(event, existing.sequence), status: 'already_present' }
          : this.reject(event, 'conflict')
      }
      this.sequence += 1
      this.events.set(event.clientEventId, { payload, sequence: this.sequence })
      if (event.kind === 'node_complete' && event.nodeId) this.completedNodeIds.add(event.nodeId)
      if (event.kind === 'checkpoint_exposure' && event.exerciseId) this.checkpointExposed.add(event.exerciseId)
      return this.accept(event, this.sequence)
    })
    return { acknowledgments, lastSequence: this.sequence }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private assertIdentity(identity: { courseId: string; contentVersion: string }): void {
    if (identity.courseId !== this.course.identity.courseId || identity.contentVersion !== this.course.identity.contentVersion) {
      throw new Error(`Unknown course revision ${identity.courseId}@${identity.contentVersion}`)
    }
  }

  private isKnownSource(source: AudioSourceRef): boolean {
    if (source.sourceKind === 'sfx') return this.course.course.sfx.some((sfx) => sfx.id === source.sourceId)
    if (source.sourceKind === 'utterance') return this.course.utteranceById.has(source.sourceId)
    return this.course.targetById.has(source.sourceId)
  }

  private resolveOne(source: AudioSourceRef): AudioResolution {
    if (!this.isKnownSource(source)) {
      return { state: 'failed', source, code: 'unknown_source', retryable: false, retryAfterMs: null, message: 'That audio source is not part of this course.' }
    }
    if (source.sourceKind === 'sfx') {
      return this.preview(source, 'Procedural preview cue rendered in the browser; Codex stores the same recipe as a file.')
    }
    const key = sourceKey(source)
    const attempts = (this.resolveAttempts.get(key) ?? 0) + 1
    this.resolveAttempts.set(key, attempts)
    switch (this.scenario.audio) {
      case 'preview':
        return this.preview(source)
      case 'queued':
      case 'generating':
      case 'progress': {
        const requestId = `mock-req-${key}-${attempts}`
        this.pendingRequests.set(requestId, { source, polls: 0 })
        return this.queued(source, requestId, this.scenario.audio === 'generating' ? 'generating' : 'queued')
      }
      case 'unavailable':
        return { state: 'unavailable', source, code: 'provider_unconfigured', retryable: false, retryAfterMs: null, message: 'Speech generation is not configured in this build.' }
      case 'failedRetryable':
        return attempts === 1
          ? { state: 'failed', source, code: 'provider_unavailable', retryable: true, retryAfterMs: 800, message: 'The speech provider did not respond. You can try again.' }
          : this.preview(source, 'Retry succeeded (mock).')
      case 'signInRequired':
        return { state: 'unavailable', source, code: 'sign_in_required', retryable: false, retryAfterMs: null, message: 'Sign in to generate audio for this line. Already-generated lines stay playable for guests.' }
      case 'networkError':
        throw new TypeError('Failed to fetch')
    }
  }

  private preview(source: AudioSourceRef, message = 'Preview only: no generated Mandarin audio exists yet.'): AudioResolution {
    return { state: 'preview', source, delivery: 'simulated', message }
  }

  private queued(source: AudioSourceRef, requestId: string, state: 'queued' | 'generating'): AudioResolution {
    return { state, source, requestId, pollUrl: `${MOCK_POLL_URL_PREFIX}${requestId}`, retryAfterMs: POLL_RETRY_MS }
  }

  private accept(event: PracticeEvent, sequence: number): EventAcknowledgment {
    const { correctness, grade } = this.grade(event)
    return {
      clientEventId: event.clientEventId,
      status: 'accepted',
      canonicalSequence: sequence,
      serverAcceptedAt: this.now().toISOString(),
      correctness,
      grade,
      reasonCode: null,
    }
  }

  private reject(event: PracticeEvent, reasonCode: string): EventAcknowledgment {
    return { clientEventId: event.clientEventId, status: 'rejected', canonicalSequence: null, serverAcceptedAt: null, correctness: null, grade: null, reasonCode }
  }

  /**
   * Mirrors the documented grading policy so the UI can be exercised; the
   * real server recomputes everything from the versioned course.
   */
  private grade(event: PracticeEvent): Pick<EventAcknowledgment, 'correctness' | 'grade'> {
    if (event.kind !== 'response' || !event.exerciseId) return { correctness: null, grade: null }
    if (event.orderedTileIds) {
      const construction = this.course.constructionById.get(event.exerciseId)
      if (!construction) return { correctness: null, grade: null }
      const correct = construction.correctTileIds.length === event.orderedTileIds.length
        && construction.correctTileIds.every((tileId, index) => tileId === event.orderedTileIds?.[index])
      return { correctness: correct ? 'correct' : 'incorrect', grade: null }
    }
    const exercise = this.course.exerciseById.get(event.exerciseId) ?? this.course.checkpointById.get(event.exerciseId)
    if (!exercise) return { correctness: null, grade: null }
    if (event.responseAction === 'skip') return { correctness: 'unscored', grade: null }
    if (event.audioEvidence.status !== 'completed') return { correctness: 'unscored', grade: null }
    const eligible = event.mode === 'lesson' || event.mode === 'review'
    if (event.responseAction === 'dont_know') return { correctness: 'incorrect', grade: eligible ? 'Again' : null }
    const correct = event.selectedOptionId === exercise.correctOptionId
    if (!correct) return { correctness: 'incorrect', grade: eligible ? 'Again' : null }
    if (!eligible) return { correctness: 'correct', grade: null }
    if (event.textHelpUsed || event.pinyinHelpUsed) return { correctness: 'correct', grade: 'Again' }
    if (event.audioEvidence.slowPlayCount > 0 || event.audioEvidence.normalPlayCount > 1) return { correctness: 'correct', grade: 'Hard' }
    return { correctness: 'correct', grade: 'Good' }
  }
}
