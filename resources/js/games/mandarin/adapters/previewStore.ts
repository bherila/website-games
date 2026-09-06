/**
 * Local persistence for the preview partition. Every key starts with
 * `mandarin.preview.` so preview data can never be confused with, merged into
 * or promoted to a real account's learning history.
 */
import type { PracticeEvent } from '../contracts/mandarin'

export const PREVIEW_STORAGE_PREFIX = 'mandarin.preview.'
export const PREVIEW_KEYS = {
  progress: `${PREVIEW_STORAGE_PREFIX}progress.v1`,
  settings: `${PREVIEW_STORAGE_PREFIX}settings.v1`,
  outbox: `${PREVIEW_STORAGE_PREFIX}outbox.v1`,
  client: `${PREVIEW_STORAGE_PREFIX}client.v1`,
} as const

export interface PreviewStore {
  loadProgress(): unknown | null
  saveProgress(progress: unknown): void
  loadSettings(): unknown | null
  saveSettings(settings: unknown): void
  loadOutbox(): PracticeEvent[]
  saveOutbox(events: readonly PracticeEvent[]): void
  /** Stable per-browser identifier for `clientInstanceId`. */
  clientInstanceId(create: () => string): string
  /** Removes every `mandarin.preview.*` key. */
  clearAll(): void
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function readJson(storage: StorageLike | null, key: string): unknown | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota/private mode: the preview simply does not persist.
  }
}

export function createLocalPreviewStore(storage: StorageLike | null): PreviewStore {
  return {
    loadProgress: () => readJson(storage, PREVIEW_KEYS.progress),
    saveProgress: (progress) => writeJson(storage, PREVIEW_KEYS.progress, progress),
    loadSettings: () => readJson(storage, PREVIEW_KEYS.settings),
    saveSettings: (settings) => writeJson(storage, PREVIEW_KEYS.settings, settings),
    loadOutbox: () => {
      const value = readJson(storage, PREVIEW_KEYS.outbox)
      return Array.isArray(value) ? (value as PracticeEvent[]) : []
    },
    saveOutbox: (events) => writeJson(storage, PREVIEW_KEYS.outbox, events),
    clientInstanceId: (create) => {
      const existing = readJson(storage, PREVIEW_KEYS.client)
      if (typeof existing === 'string' && existing.length > 0) return existing
      const created = create()
      writeJson(storage, PREVIEW_KEYS.client, created)
      return created
    },
    clearAll: () => {
      if (!storage) return
      try {
        const keys: string[] = []
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          if (key && key.startsWith(PREVIEW_STORAGE_PREFIX)) keys.push(key)
        }
        for (const key of keys) storage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}

export function createMemoryPreviewStore(): PreviewStore {
  const map = new Map<string, string>()
  const storage: StorageLike = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
  return createLocalPreviewStore(storage)
}

export function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
