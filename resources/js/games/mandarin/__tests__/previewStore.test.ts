import { createLocalPreviewStore, createMemoryPreviewStore, PREVIEW_KEYS, PREVIEW_STORAGE_PREFIX } from '../adapters/previewStore'

class FakeStorage {
  private readonly map = new Map<string, string>()
  get length(): number { return this.map.size }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null }
  getItem(key: string): string | null { return this.map.get(key) ?? null }
  setItem(key: string, value: string): void { this.map.set(key, value) }
  removeItem(key: string): void { this.map.delete(key) }
  keys(): string[] { return [...this.map.keys()] }
}

describe('preview store partition', () => {
  it('writes only mandarin.preview.* keys and leaves other keys alone on reset', () => {
    const storage = new FakeStorage()
    storage.setItem('game-data:tower-throwback', '{"real":true}')
    storage.setItem('mandarin.progress.v1', '{"not":"preview"}')
    const store = createLocalPreviewStore(storage)
    store.saveProgress({ a: 1 })
    store.saveSettings({ b: 2 })
    store.saveOutbox([])
    const id = store.clientInstanceId(() => 'client-x')
    expect(id).toBe('client-x')
    expect(store.clientInstanceId(() => 'other')).toBe('client-x')
    const written = storage.keys().filter((key) => !['game-data:tower-throwback', 'mandarin.progress.v1'].includes(key))
    expect(written.length).toBe(4)
    for (const key of written) expect(key.startsWith(PREVIEW_STORAGE_PREFIX)).toBe(true)
    expect(Object.values(PREVIEW_KEYS).every((key) => key.startsWith(PREVIEW_STORAGE_PREFIX))).toBe(true)
    store.clearAll()
    expect(storage.keys().sort()).toEqual(['game-data:tower-throwback', 'mandarin.progress.v1'])
  })

  it('tolerates corrupt JSON and a missing storage', () => {
    const storage = new FakeStorage()
    storage.setItem(PREVIEW_KEYS.progress, '{not json')
    expect(createLocalPreviewStore(storage).loadProgress()).toBeNull()
    const none = createLocalPreviewStore(null)
    none.saveProgress({ a: 1 })
    expect(none.loadProgress()).toBeNull()
    expect(none.loadOutbox()).toEqual([])
  })

  it('memory store round-trips', () => {
    const store = createMemoryPreviewStore()
    store.saveProgress({ x: 1 })
    expect(store.loadProgress()).toEqual({ x: 1 })
    store.clearAll()
    expect(store.loadProgress()).toBeNull()
  })
})
