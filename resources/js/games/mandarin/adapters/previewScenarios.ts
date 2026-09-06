/**
 * Deterministic preview scenarios for the mock gateway and mock audio manager.
 *
 * These selectors exist ONLY for the preview composition root
 * (`previewRuntime.ts`), local development and tests. A live runtime must not
 * read them: the production gateway is chosen at composition time, never by a
 * query parameter.
 */
import type { SaveState } from '../contracts/mandarin'

export type PreviewScenarioId =
  | 'fresh'
  | 'returning'
  | 'dueReviews'
  | 'noDueReviews'
  | 'queuedAudio'
  | 'generatingAudio'
  | 'readyAudio'
  | 'providerUnavailable'
  | 'retryableError'
  | 'noDeviceVoice'
  | 'offline'
  | 'guest'
  | 'saving'
  | 'signInRequired'

export type MockAudioBehavior =
  /** Every speech source resolves straight to the non-live `preview` state. */
  | 'preview'
  /** Stays queued on every poll until the manager's bounded poll budget runs out. */
  | 'queued'
  /** Stays generating on every poll until the manager's bounded poll budget runs out. */
  | 'generating'
  /** queued → generating → preview. Stands in for the live ready transition without inventing a URL. */
  | 'progress'
  /** `unavailable` with `provider_unconfigured`; not retryable. */
  | 'unavailable'
  /** `failed` with `provider_unavailable`, retryable; the first explicit retry succeeds. */
  | 'failedRetryable'
  /** Network layer throws (offline). */
  | 'networkError'
  /** `unavailable` with `sign_in_required` (guest cannot trigger cold generation). */
  | 'signInRequired'

export interface PreviewScenario {
  id: PreviewScenarioId
  label: string
  description: string
  account: { signedIn: boolean; accountPartitionId: string | null }
  capabilities: { canGenerateAudio: boolean; canSaveToAccount: boolean; hasDistinctMandarinVoices: false }
  saveState: SaveState
  audio: MockAudioBehavior
  /** `none` hides device voices even when the browser has one. */
  deviceVoice: 'auto' | 'none'
  seedProgress: 'fresh' | 'returning'
  dueTargetIds: readonly string[]
  appendDelayMs: number
  appendBehavior: 'accept' | 'networkError' | 'signInRequired'
}

const RETURNING_DUE = ['hello', 'be', 'who', 'my-friend', 'find', 'here', 'at', 'question-ma', 'where', 'dont-know', 'not-present', 'he'] as const

const base = {
  account: { signedIn: false, accountPartitionId: null },
  capabilities: { canGenerateAudio: false, canSaveToAccount: false, hasDistinctMandarinVoices: false as const },
  saveState: 'local_preview' as SaveState,
  audio: 'preview' as MockAudioBehavior,
  deviceVoice: 'auto' as const,
  seedProgress: 'fresh' as const,
  dueTargetIds: [] as readonly string[],
  appendDelayMs: 0,
  appendBehavior: 'accept' as const,
}

export const PREVIEW_SCENARIOS: readonly PreviewScenario[] = [
  { ...base, id: 'fresh', label: 'Fresh learner', description: 'Empty local preview progress; speech resolves to the non-live preview state.' },
  { ...base, id: 'returning', label: 'Returning learner', description: 'Scenes 1–2 complete, current node in scene 3, twelve targets due (backlogged review).', seedProgress: 'returning', dueTargetIds: RETURNING_DUE },
  { ...base, id: 'dueReviews', label: 'Some reviews due', description: 'Returning learner with six due targets (loaded review session).', seedProgress: 'returning', dueTargetIds: RETURNING_DUE.slice(0, 6) },
  { ...base, id: 'noDueReviews', label: 'No due reviews', description: 'Returning learner with nothing due; review offers extra practice instead.', seedProgress: 'returning' },
  { ...base, id: 'queuedAudio', label: 'Audio queued', description: 'Every speech source stays queued; shows “Preparing audio” and the bounded wait.', audio: 'queued' },
  { ...base, id: 'generatingAudio', label: 'Audio generating', description: 'Every speech source stays generating until the poll budget runs out.', audio: 'generating' },
  { ...base, id: 'readyAudio', label: 'Audio becomes available', description: 'queued → generating → preview. The live gateway returns a ready URL at the last step; the mock never fabricates one.', audio: 'progress' },
  { ...base, id: 'providerUnavailable', label: 'Provider unavailable', description: 'Generation is not configured; speech is unavailable and not retryable.', audio: 'unavailable' },
  { ...base, id: 'retryableError', label: 'Retryable error', description: 'First resolution fails with a retryable provider error; Retry succeeds.', audio: 'failedRetryable' },
  { ...base, id: 'noDeviceVoice', label: 'No device voice', description: 'Browser has no Mandarin voice, so preview playback is simulated and unscored.', deviceVoice: 'none' },
  { ...base, id: 'offline', label: 'Offline', description: 'Network calls fail; progress stays local and audio cannot be resolved.', saveState: 'offline', audio: 'networkError', appendBehavior: 'networkError' },
  { ...base, id: 'guest', label: 'Guest (mock)', description: 'Guest session: can browse, cannot trigger generation; progress is guest-local.', saveState: 'guest_local', audio: 'signInRequired' },
  { ...base, id: 'saving', label: 'Signed in, saving (mock)', description: 'Mock signed-in account; events “save” after a delay. Nothing reaches a real account.', account: { signedIn: true, accountPartitionId: 'mock-account' }, capabilities: { canGenerateAudio: true, canSaveToAccount: true, hasDistinctMandarinVoices: false }, saveState: 'saving', appendDelayMs: 1500 },
  { ...base, id: 'signInRequired', label: 'Sign-in required', description: 'Session expired: saves are rejected until sign-in.', saveState: 'sign_in_required', appendBehavior: 'signInRequired' },
]

export const DEFAULT_SCENARIO_ID: PreviewScenarioId = 'fresh'

export function findPreviewScenario(id: string | null | undefined): PreviewScenario {
  return PREVIEW_SCENARIOS.find((scenario) => scenario.id === id) ?? PREVIEW_SCENARIOS[0]!
}

/** Preview-root only. Reads `?scenario=` from a query string. */
export function resolvePreviewScenarioFromSearch(search: string): PreviewScenario {
  return findPreviewScenario(new URLSearchParams(search).get('scenario'))
}

export function previewScenarioHref(id: PreviewScenarioId, pathname = typeof window === 'undefined' ? '/mandarin/preview' : window.location.pathname): string {
  return id === DEFAULT_SCENARIO_ID ? pathname : `${pathname}?scenario=${id}`
}
