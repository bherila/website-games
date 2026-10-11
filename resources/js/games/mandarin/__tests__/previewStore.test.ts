import { createLocalPreviewStore, createMemoryPreviewStore, DEAD_LETTER_LIMIT, type DeadLetter, PREVIEW_KEYS, PREVIEW_STORAGE_PREFIX } from '../adapters/previewStore'
import type { PracticeEvent } from '../contracts/mandarin'

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
  it('reports a dead-letter write that storage refused', () => {
    const storage = new FakeStorage()
    const store = createLocalPreviewStore(storage)
    const entry: DeadLetter = { event: { clientEventId: 'e1' } as PracticeEvent, reasonCode: 'conflict', rejectedAt: '2026-10-10T00:00:00.000Z' }
    expect(store.addDeadLetters([entry])).toBe(true)
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError') }
    expect(store.addDeadLetters([entry])).toBe(false)
    expect(store.loadDeadLetters()).toHaveLength(1)
    expect(createLocalPreviewStore(null).addDeadLetters([entry])).toBe(false)
  })

  it('records an event set aside twice only once', () => {
    // Two tabs, or an outbox write lost after the set-aside, reject the same event again (#111 review).
    const store = createMemoryPreviewStore()
    const entry = (id: string, rejectedAt: string): DeadLetter => ({ event: { clientEventId: id } as PracticeEvent, reasonCode: 'conflict', rejectedAt })
    expect(store.addDeadLetters([entry('a', 't1'), entry('b', 't1')])).toBe(true)
    expect(store.addDeadLetters([entry('a', 't2'), entry('c', 't2'), entry('c', 't2')])).toBe(true)
    expect(store.loadDeadLetters().map((kept) => [kept.event.clientEventId, kept.rejectedAt])).toEqual([['a', 't1'], ['b', 't1'], ['c', 't2']])
  })

  it('keeps only the newest dead letters, and clears them on reset', () => {
    const store = createMemoryPreviewStore()
    const entry = (n: number): DeadLetter => ({ event: { clientEventId: `e${n}` } as PracticeEvent, reasonCode: 'conflict', rejectedAt: '2026-10-10T00:00:00.000Z' })
    store.addDeadLetters(Array.from({ length: DEAD_LETTER_LIMIT - 1 }, (_, n) => entry(n)))
    store.addDeadLetters([entry(1000), entry(1001)])
    const kept = store.loadDeadLetters()
    expect(kept).toHaveLength(DEAD_LETTER_LIMIT)
    expect(kept[0]!.event.clientEventId).toBe('e1')
    expect(kept.at(-1)!.event.clientEventId).toBe('e1001')
    store.clearAll()
    expect(store.loadDeadLetters()).toEqual([])
  })

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
