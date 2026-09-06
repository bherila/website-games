/**
 * Live gateway over the Laravel endpoints. Same interface as the mock, same
 * response shapes; the UI cannot tell them apart except that this one never
 * returns the non-live `preview` audio state.
 *
 * Error mapping (kept honest for the UI's save-state chip):
 *  - network failure → throws (TypeError), like the mock's offline scenario
 *  - 401 / 419 on writes → every event rejected with `sign_in_required`
 *  - guests never call the authenticated progress endpoint; they get an empty projection
 */
import type {
  AppendResult,
  AudioBatchRequest,
  AudioBatchResponse,
  AudioResolution,
  Bootstrap,
  MandarinGateway,
  PracticeEvent,
  ProgressProjection,
} from '../contracts/mandarin'
import type { Course } from '../domain/courseSchema'
import { parseCourse } from '../domain/courseSchema'
import { dueTargetIdsFromProjection } from '../domain/scheduler'

export const MANDARIN_API = {
  bootstrap: '/api/games/mandarin/bootstrap',
  progress: '/api/games/mandarin/progress',
  events: '/api/games/mandarin/events',
  resolve: '/api/games/mandarin/audio/resolve',
  poll: (requestId: string) => `/api/games/mandarin/audio/requests/${encodeURIComponent(requestId)}`,
} as const

export class GatewayHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'GatewayHttpError'
  }
}

export interface HttpGatewayOptions {
  fetch?: typeof fetch
  /** Reads the CSRF token; defaults to the layout's meta tag. */
  csrfToken?: () => string | null
  now?: () => Date
}

function readMetaCsrf(): string | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? null
}

export class HttpMandarinGateway implements MandarinGateway<Course> {
  private readonly fetchImpl: typeof fetch
  private readonly csrf: () => string | null
  private readonly now: () => Date
  private bootstrapCache: Bootstrap<Course> | null = null
  private csrfOverride: string | null = null

  constructor(options: HttpGatewayOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.csrf = options.csrfToken ?? readMetaCsrf
    this.now = options.now ?? (() => new Date())
  }

  /** The last bootstrap, if any (the live runtime needs the account partition before rendering). */
  cachedBootstrap(): Bootstrap<Course> | null {
    return this.bootstrapCache
  }

  async bootstrap(signal?: AbortSignal): Promise<Bootstrap<Course>> {
    const response = await this.request('GET', MANDARIN_API.bootstrap, undefined, signal)
    if (!response.ok) throw new GatewayHttpError(response.status, `bootstrap failed (${response.status})`)
    const raw = (await response.json()) as Bootstrap<unknown>
    const course = parseCourse(raw.course)
    const bootstrap: Bootstrap<Course> = { ...raw, course }
    this.bootstrapCache = bootstrap
    return bootstrap
  }

  async resolveAudio(request: AudioBatchRequest, signal?: AbortSignal): Promise<AudioBatchResponse> {
    if (request.sources.length > 16) throw new Error('resolveAudio accepts at most 16 sources')
    const response = await this.request('POST', MANDARIN_API.resolve, request, signal)
    if (response.status === 401 || response.status === 419 || response.status === 403) {
      return {
        courseId: request.courseId,
        contentVersion: request.contentVersion,
        results: request.sources.map((source): AudioResolution => ({
          state: 'unavailable',
          source,
          code: 'sign_in_required',
          retryable: false,
          retryAfterMs: null,
          message: 'Sign in to generate audio for this line.',
        })),
      }
    }
    if (!response.ok) throw new GatewayHttpError(response.status, `resolve failed (${response.status})`)
    return (await response.json()) as AudioBatchResponse
  }

  async pollAudio(requestId: string, signal?: AbortSignal): Promise<AudioResolution> {
    const response = await this.request('GET', MANDARIN_API.poll(requestId), undefined, signal)
    if (!response.ok) throw new GatewayHttpError(response.status, `poll failed (${response.status})`)
    return (await response.json()) as AudioResolution
  }

  async getProgress(signal?: AbortSignal): Promise<ProgressProjection> {
    const bootstrap = this.bootstrapCache ?? (await this.bootstrap(signal))
    if (!bootstrap.account.signedIn) {
      return {
        courseId: bootstrap.course.courseId,
        contentVersion: bootstrap.course.contentVersion,
        lastSequence: 0,
        completedNodeIds: [],
        completedSceneIds: [],
        currentNodeId: bootstrap.course.scenes.slice().sort((a, b) => a.order - b.order)[0]?.nodeIds[0] ?? '',
        dueTargetIds: [],
        checkpointExposedIds: [],
        schedulerVersion: 'guest',
        schedulerConfigHash: 'guest',
        listeningCards: {},
      }
    }
    const response = await this.request('GET', MANDARIN_API.progress, undefined, signal)
    if (!response.ok) throw new GatewayHttpError(response.status, `progress failed (${response.status})`)
    const projection = (await response.json()) as ProgressProjection
    // The server owns grades; the pinned scheduler adapter derives what is due.
    return { ...projection, dueTargetIds: dueTargetIdsFromProjection(projection, this.now()) }
  }

  async appendEvents(events: PracticeEvent[], signal?: AbortSignal): Promise<AppendResult> {
    if (events.length === 0) return { acknowledgments: [], lastSequence: 0 }
    const response = await this.request('POST', MANDARIN_API.events, { events }, signal)
    if (response.status === 401 || response.status === 419) {
      return {
        acknowledgments: events.map((event) => ({
          clientEventId: event.clientEventId,
          status: 'rejected' as const,
          canonicalSequence: null,
          serverAcceptedAt: null,
          correctness: null,
          grade: null,
          reasonCode: 'sign_in_required',
        })),
        lastSequence: 0,
      }
    }
    if (!response.ok) throw new GatewayHttpError(response.status, `events failed (${response.status})`)
    return (await response.json()) as AppendResult
  }

  private async request(method: 'GET' | 'POST', url: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      const token = this.csrfOverride ?? this.csrf()
      if (token) headers['X-CSRF-TOKEN'] = token
    }
    const response = await this.fetchImpl(url, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
    const refreshed = response.headers.get('X-CSRF-TOKEN')
    if (refreshed) this.csrfOverride = refreshed
    return response
  }
}
