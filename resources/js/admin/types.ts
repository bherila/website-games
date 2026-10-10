/** Server contract for the admin panel (AdminPanelController, MandarinAudioAdminController). */
export type AudioState = 'ready' | 'queued' | 'generating' | 'failed' | 'missing' | 'unavailable'

export const AUDIO_STATES: readonly AudioState[] = ['ready', 'queued', 'generating', 'failed', 'missing', 'unavailable']

export interface PanelData {
  /** The identity provider's user-management page for this application; null when not configured. */
  usersUrl: string | null
  qaUrl: string
  qaAvailable: boolean
  audio: {
    index: string
    request: string
    regenerate: string
    requestMissing: string
    retryFailed: string
  }
}

export interface AudioEntry {
  key: string
  source: { sourceKind: string; sourceId: string; variant: string }
  text: string
  pinyin: string
  en: string
  role: string
  state: AudioState
  code: string | null
  assetId: number | null
  provider: string | null
  voice: string | null
  attempts: number | null
  error: string | null
  updatedAt: string | null
  url: string | null
  contentType: string | null
}

export interface AudioPage {
  course: { courseId: string; contentVersion: string }
  generationEnabled: boolean
  summary: Record<AudioState, number>
  pending: boolean
  entries: AudioEntry[]
  page: number
  perPage: number
  lastPage: number
  total: number
}

export interface AudioFilters {
  state: AudioState | ''
  q: string
  page: number
}

export interface OperationResult {
  action: 'request' | 'regenerate' | 'request_missing' | 'retry_failed'
  queued: number
  skipped: { key: string; reason: string }[]
}
