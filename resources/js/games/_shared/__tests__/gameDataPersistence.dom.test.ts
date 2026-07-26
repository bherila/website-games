import { fetchWrapper } from '@/fetchWrapper'

import {
  DATABASE_GAME_SLUGS,
  defineGameData,
  definitionRowKey,
  flushGameDataWrites,
  gameDataStorage,
  initializeGameDataPersistence,
  resetGameDataPersistenceForTests,
} from '../gameDataPersistence'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    delete: jest.fn(),
    get: jest.fn(),
    getRaw: jest.fn(),
    put: jest.fn(),
  },
}))

const mockGet = fetchWrapper.getRaw as jest.Mock
const mockPut = fetchWrapper.put as jest.Mock

function mockIndexResponse(body: unknown, status = 200, headers = new Headers()): void {
  mockGet.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
  } as Response)
}

interface TestProgress {
  version: 1
  score: number
}

const progressDefinition = defineGameData<TestProgress>({
  game: 'marble-sort',
  localStorageKey: 'test.game.progress',
  parse: (value) => {
    if (!isRecord(value) || value.version !== 1 || typeof value.score !== 'number') {
      return null
    }

    return { version: 1, score: value.score }
  },
  encode: (progress) => [{
    scope: 'profile',
    slot: 'default',
    data: { version: 1, score: progress.score },
  }],
  decode: (rows) => {
    const data = rows.get(definitionRowKey('profile', 'default'))?.data

    return isRecord(data) && typeof data.score === 'number'
      ? { version: 1, score: data.score }
      : null
  },
})

const saveDefinition = defineGameData<TestProgress>({
  game: 'marble-sort',
  localStorageKey: 'test.game.save',
  parse: progressDefinition.parse as (value: unknown) => TestProgress | null,
  encode: (progress) => [{
    scope: 'save',
    slot: 'autosave',
    data: { version: 1, score: progress.score },
  }],
  decode: (rows) => {
    const data = rows.get(definitionRowKey('save', 'autosave'))?.data

    return isRecord(data) && typeof data.score === 'number'
      ? { version: 1, score: data.score }
      : null
  },
  clearSlots: [{ scope: 'save', slot: 'autosave' }],
})

const inventoryDefinition = defineGameData<TestProgress>({
  game: 'marble-sort',
  localStorageKey: 'test.game.inventory',
  parse: progressDefinition.parse as (value: unknown) => TestProgress | null,
  encode: (progress) => [{
    scope: 'profile',
    slot: 'inventory',
    data: { version: 1, score: progress.score },
  }],
  decode: (rows) => {
    const data = rows.get(definitionRowKey('profile', 'inventory'))?.data

    return isRecord(data) && typeof data.score === 'number'
      ? { version: 1, score: data.score }
      : null
  },
})

describe('game data persistence', () => {
  beforeEach(() => {
    resetGameDataPersistenceForTests()
    window.localStorage.clear()
    document.getElementById('app-initial-data')?.remove()
    jest.useRealTimers()
    jest.clearAllMocks()
    mockIndexResponse({ data: [] })
    mockPut.mockImplementation(async (url: string, body: BatchBody) => batchResponse(url, body))
  })

  afterEach(() => {
    resetGameDataPersistenceForTests()
    jest.useRealTimers()
  })

  it('keeps anonymous progress in localStorage without calling the API', async () => {
    installAuthentication(false)
    await initializeGameDataPersistence([progressDefinition])

    gameDataStorage()?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 8 }))

    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":8}')
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('loads only the requested game and omits saves for progress-only pages', async () => {
    installAuthentication(true)

    await initializeGameDataPersistence([progressDefinition])

    expect(mockGet).toHaveBeenCalledWith(
      '/api/games/data?include_saves=0&games%5B%5D=marble-sort',
    )
  })

  it('refreshes the cached shell CSRF token from authenticated hydration', async () => {
    installAuthentication(true)
    const meta = document.createElement('meta')
    meta.name = 'csrf-token'
    meta.content = 'stale-token'
    document.head.appendChild(meta)
    mockIndexResponse({ data: [] }, 200, new Headers({ 'X-CSRF-TOKEN': 'fresh-token' }))

    await initializeGameDataPersistence([progressDefinition])

    expect(meta.content).toBe('fresh-token')
    meta.remove()
  })

  it('merges a local monotonic profile into existing authenticated data', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 99 }))
    mockIndexResponse({
      data: [row('marble-sort', 'profile', 'default', { version: 1, score: 12 })],
    })

    await initializeGameDataPersistence([progressDefinition])

    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":99}')
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()
    expect(mockPut).toHaveBeenCalledTimes(1)
  })

  it('promotes a local save only after a successful authenticated database write', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 18 }))

    await initializeGameDataPersistence([progressDefinition])

    expect(mockPut).toHaveBeenCalledWith('/api/games/marble-sort/data', {
      operations: [{
        action: 'put',
        scope: 'profile',
        slot: 'default',
        data: { version: 1, score: 18 },
        revision: null,
      }],
    })
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()
    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":18}')
  })

  it('migrates local progress and snapshot in one retryable per-game batch', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 18 }))
    window.localStorage.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 19 }))
    mockPut.mockRejectedValueOnce('offline')

    await expect(initializeGameDataPersistence([progressDefinition, saveDefinition])).rejects.toBe('offline')

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect((mockPut.mock.calls[0]?.[1] as BatchBody).operations.map(({ scope, slot }) => `${scope}/${slot}`)).toEqual([
      'profile/default',
      'save/autosave',
    ])
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).not.toBeNull()
    expect(window.localStorage.getItem(saveDefinition.localStorageKey)).not.toBeNull()

    await initializeGameDataPersistence([progressDefinition, saveDefinition])

    expect(mockPut).toHaveBeenCalledTimes(2)
    expect((mockPut.mock.calls[1]?.[1] as BatchBody).operations.map(({ scope, slot }) => `${scope}/${slot}`)).toEqual([
      'profile/default',
      'save/autosave',
    ])
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()
    expect(window.localStorage.getItem(saveDefinition.localStorageKey)).toBeNull()
    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":18}')
    expect(gameDataStorage()?.getItem(saveDefinition.localStorageKey)).toBe('{"version":1,"score":19}')
  })

  it('does not resurrect a local snapshot when grouped migration sees a save tombstone', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 17 }))
    window.localStorage.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 18 }))
    mockIndexResponse({
      data: [{
        ...row('marble-sort', 'save', 'autosave', {}),
        data: {},
        is_deleted: true,
        revision: 2,
      }],
    })

    await initializeGameDataPersistence([progressDefinition, saveDefinition])

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect((mockPut.mock.calls[0]?.[1] as BatchBody).operations.map(({ scope, slot }) => `${scope}/${slot}`)).toEqual([
      'profile/default',
    ])
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()
    expect(window.localStorage.getItem(saveDefinition.localStorageKey)).toBeNull()
    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":17}')
    expect(gameDataStorage()?.getItem(saveDefinition.localStorageKey)).toBeNull()
  })

  it('uses a playable local-backed server shadow when authenticated hydration is offline', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 21 }))
    mockGet.mockRejectedValue(new TypeError('offline'))

    await expect(initializeGameDataPersistence([progressDefinition])).resolves.toBeUndefined()

    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).not.toBeNull()
    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":21}')
  })

  it('persists an offline server-mode write across a simulated tab close', async () => {
    installAuthentication(true)
    mockGet.mockRejectedValue(new TypeError('offline'))
    await initializeGameDataPersistence([progressDefinition])

    gameDataStorage()?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 22 }))

    const shadowKey = findServerShadowKey()
    expect(shadowKey).toBeDefined()
    expect(window.localStorage.getItem(shadowKey!)).toContain('"score":22')
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()

    resetGameDataPersistenceForTests()
    document.getElementById('app-initial-data')?.remove()
    installAuthentication(true)
    await initializeGameDataPersistence([progressDefinition])

    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":22}')
  })

  it('uses the last live account shadow from a sanitized cached shell', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'profile', 'default', { version: 1, score: 25 })],
    })
    await initializeGameDataPersistence([progressDefinition])

    resetGameDataPersistenceForTests()
    document.getElementById('app-initial-data')?.remove()
    installCachedShell()
    mockGet.mockRejectedValue(new TypeError('offline'))

    await initializeGameDataPersistence([progressDefinition])

    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":25}')
  })

  it('switches to anonymous local mode on a 401 instead of treating it as offline', async () => {
    installAuthentication(true)
    window.localStorage.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 23 }))
    mockIndexResponse({ message: 'Unauthenticated.' }, 401)

    await initializeGameDataPersistence([progressDefinition])
    gameDataStorage()?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 24 }))

    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":24}')
    expect(mockPut).not.toHaveBeenCalled()
    expect(findServerShadowKey()).toBeUndefined()
  })

  it('replays the durable queue with its original revision and writer sequence', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])

    resetGameDataPersistenceForTests()
    document.getElementById('app-initial-data')?.remove()
    installAuthentication(true)
    mockGet.mockRejectedValue(new TypeError('offline'))
    await initializeGameDataPersistence([saveDefinition])
    gameDataStorage()?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))

    const shadowKey = findServerShadowKey()
    const durableState = JSON.parse(window.localStorage.getItem(shadowKey!)!) as {
      queues: Array<{ pending: Array<{ writerId?: string, writerSequence?: number }> }>
    }
    const durableOperation = durableState.queues[0]?.pending[0]

    resetGameDataPersistenceForTests()
    document.getElementById('app-initial-data')?.remove()
    installAuthentication(true)
    mockIndexResponse({
      data: [{ ...row('marble-sort', 'save', 'autosave', { version: 1, score: 9 }), revision: 2 }],
    })
    mockPut.mockResolvedValue({
      data: [{
        action: 'put',
        scope: 'save',
        slot: 'autosave',
        status: 'stale',
        row: { ...row('marble-sort', 'save', 'autosave', { version: 1, score: 9 }), revision: 2 },
      }],
    })
    const conflictListener = jest.fn()
    window.addEventListener('game-data-conflict', conflictListener)

    await initializeGameDataPersistence([saveDefinition])
    await flushGameDataWrites()

    const replayedOperation = (mockPut.mock.calls.at(-1)?.[1] as BatchBody).operations[0]
    expect(replayedOperation?.revision).toBe(1)
    expect(replayedOperation?.writer_id).toBe(durableOperation?.writerId)
    expect(replayedOperation?.writer_sequence).toBe(durableOperation?.writerSequence)
    expect(conflictListener).toHaveBeenCalledTimes(1)
    window.removeEventListener('game-data-conflict', conflictListener)
  })

  it('coalesces rapid writes to the latest value for a row', async () => {
    installAuthentication(true)
    await initializeGameDataPersistence([progressDefinition])
    const storage = gameDataStorage()

    storage?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 1 }))
    storage?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 2 }))
    storage?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 3 }))
    await flushGameDataWrites()

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledWith('/api/games/marble-sort/data', {
      operations: [{
        action: 'put',
        scope: 'profile',
        slot: 'default',
        data: { version: 1, score: 3 },
        revision: null,
      }],
    }, { keepalive: true })
  })

  it('does not rewrite a row whose object keys only differ in order', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'profile', 'default', { score: 4, version: 1 })],
    })
    await initializeGameDataPersistence([progressDefinition])

    gameDataStorage()?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 4 }))
    await flushGameDataWrites()

    expect(mockPut).not.toHaveBeenCalled()
  })

  it('retries a failed authenticated write without reviving the anonymous key', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    await initializeGameDataPersistence([progressDefinition])
    mockPut.mockRejectedValueOnce('offline')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    gameDataStorage()?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 7 }))
    await jest.runOnlyPendingTimersAsync()

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(progressDefinition.localStorageKey)).toBeNull()

    await jest.advanceTimersByTimeAsync(1_000)
    await flushGameDataWrites()

    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(gameDataStorage()?.getItem(progressDefinition.localStorageKey)).toBe('{"version":1,"score":7}')
    errorSpy.mockRestore()
  })

  it('retries the exact response-lost save before sending a newer pending save', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const firstRequest = deferred<unknown>()
    let callNumber = 0
    mockPut.mockImplementation((url: string, body: BatchBody) => {
      callNumber += 1
      if (callNumber === 1) {
        return firstRequest.promise
      }

      return Promise.resolve(batchResponse(url, body))
    })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    jest.advanceTimersByTime(2_000)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    firstRequest.reject('response lost')

    await expect(flushGameDataWrites()).rejects.toBe('response lost')
    await flushGameDataWrites()

    const operations = mockPut.mock.calls.map((call) => (call[1] as BatchBody).operations[0])
    expect(operations.map((operation) => operation?.data?.score)).toEqual([5, 5, 6])
    expect(operations.map((operation) => operation?.writer_sequence)).toEqual([1, 1, 2])
    expect(operations[1]?.writer_id).toBe(operations[0]?.writer_id)
    expect(operations[2]?.revision).toBe(2)
    errorSpy.mockRestore()
  })

  it('does not postpone a failed-batch retry while newer autosaves keep arriving', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    mockPut.mockRejectedValueOnce('offline')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 1 }))
    await jest.advanceTimersByTimeAsync(2_000)
    expect(mockPut).toHaveBeenCalledTimes(1)

    for (let score = 2; score <= 6; score += 1) {
      await jest.advanceTimersByTimeAsync(191)
      storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score }))
    }
    await jest.advanceTimersByTimeAsync(44)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 7 }))
    expect(mockPut).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    expect(mockPut).toHaveBeenCalledTimes(2)
    expect((mockPut.mock.calls[1]?.[1] as BatchBody).operations[0]).toMatchObject({
      data: { version: 1, score: 1 },
      writer_sequence: 1,
    })

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 8 }))
    await jest.advanceTimersByTimeAsync(191)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 9 }))
    await flushGameDataWrites()

    expect(mockPut).toHaveBeenCalledTimes(3)
    expect((mockPut.mock.calls[2]?.[1] as BatchBody).operations[0]?.data?.score).toBe(9)
    errorSpy.mockRestore()
  })

  it('pagehide sends newer state while an exact failed batch starts retrying', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    mockPut.mockRejectedValueOnce('response lost')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    await jest.advanceTimersByTimeAsync(2_000)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    window.dispatchEvent(new Event('pagehide'))
    await flushGameDataWrites()

    const operations = mockPut.mock.calls.map((call) => (call[1] as BatchBody).operations[0])
    expect(operations.map((operation) => operation?.data?.score)).toEqual([5, 5, 6])
    expect(mockPut.mock.calls[1]?.[2]).toEqual({ keepalive: true })
    expect(mockPut.mock.calls[2]?.[2]).toEqual({ keepalive: true })
    errorSpy.mockRestore()
  })

  it('serializes an in-flight save before clearing the same save slot', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const calls: string[] = []
    let resolvePut: (value: unknown) => void = () => {
      throw new Error('PUT did not start.')
    }
    let isFirstCall = true
    mockPut.mockImplementation((url: string, body: BatchBody) => {
      calls.push(...body.operations.map((operation) => operation.action))

      if (!isFirstCall) {
        return Promise.resolve(batchResponse(url, body))
      }
      isFirstCall = false

      return new Promise((resolve) => {
        resolvePut = () => resolve(batchResponse(url, body))
      })
    })

    const storage = gameDataStorage()
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    jest.runOnlyPendingTimers()
    storage?.removeItem(saveDefinition.localStorageKey)
    resolvePut(null)
    await flushGameDataWrites()

    expect(calls).toEqual(['put', 'delete'])
  })

  it('reapplies the autosave debounce to a save queued during a slow request', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    await initializeGameDataPersistence([saveDefinition])
    const firstRequest = deferred<unknown>()
    mockPut.mockImplementationOnce(() => firstRequest.promise)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 1 }))
    jest.advanceTimersByTime(2_000)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 2 }))
    const [firstUrl, firstBody] = mockPut.mock.calls[0] as [string, BatchBody]
    firstRequest.resolve(batchResponse(firstUrl, firstBody))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPut).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1_999)
    expect(mockPut).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    await flushGameDataWrites()
    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(mockPut.mock.calls[1]?.[1].operations[0].data.score).toBe(2)
  })

  it('advances the revision when a new save follows an in-flight delete', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const revisions: Array<number | null> = []
    let resolveDelete: (value: unknown) => void = () => {
      throw new Error('DELETE did not start.')
    }
    let isFirstCall = true
    mockPut.mockImplementation((url: string, body: BatchBody) => {
      revisions.push(...body.operations.map((operation) => operation.revision))
      if (!isFirstCall) {
        return Promise.resolve(batchResponse(url, body))
      }
      isFirstCall = false

      return new Promise((resolve) => {
        resolveDelete = () => resolve(batchResponse(url, body))
      })
    })
    const storage = gameDataStorage()

    storage?.removeItem(saveDefinition.localStorageKey)
    jest.runOnlyPendingTimers()
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    resolveDelete(null)
    await flushGameDataWrites()

    expect(revisions).toEqual([1, 2])
  })

  it('retries a response-lost delete idempotently before resurrecting the save', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    mockPut.mockRejectedValueOnce('response lost')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = gameDataStorage()

    storage?.removeItem(saveDefinition.localStorageKey)
    await expect(flushGameDataWrites()).rejects.toBe('response lost')
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    await flushGameDataWrites()

    const operations = mockPut.mock.calls.map((call) => (call[1] as BatchBody).operations[0])
    expect(operations.map((operation) => operation?.action)).toEqual(['delete', 'delete', 'put'])
    expect(operations.map((operation) => operation?.writer_sequence)).toEqual([1, 1, 2])
    expect(operations[1]?.writer_id).toBe(operations[0]?.writer_id)
    expect(operations[2]?.revision).toBe(2)
    errorSpy.mockRestore()
  })

  it('flushes a delayed autosave with keepalive when the page is hidden', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    await initializeGameDataPersistence([saveDefinition])

    gameDataStorage()?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    expect(mockPut).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pagehide'))
    await flushGameDataWrites()

    expect(mockPut).toHaveBeenCalledWith('/api/games/marble-sort/data', {
      operations: [{
        action: 'put',
        scope: 'save',
        slot: 'autosave',
        data: { version: 1, score: 5 },
        revision: null,
        writer_id: expect.any(String),
        writer_sequence: 1,
      }],
    }, { keepalive: true })
  })

  it('sends a newer pending save on pagehide and ignores an older callback that arrives last', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const firstRequest = deferred<unknown>()
    const secondRequest = deferred<unknown>()
    mockPut
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    jest.advanceTimersByTime(2_000)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    window.dispatchEvent(new Event('pagehide'))

    expect(mockPut).toHaveBeenCalledTimes(2)
    const firstOperation = (mockPut.mock.calls[0]?.[1] as BatchBody).operations[0]
    const secondOperation = (mockPut.mock.calls[1]?.[1] as BatchBody).operations[0]
    expect(firstOperation?.writer_sequence).toBe(1)
    expect(secondOperation?.writer_sequence).toBe(2)
    expect(mockPut.mock.calls[1]?.[2]).toEqual({ keepalive: true })

    secondRequest.resolve(batchResult('put', 'saved', { version: 1, score: 6 }, 3))
    await Promise.resolve()
    firstRequest.resolve(batchResult('put', 'saved', { version: 1, score: 5 }, 2))
    await flushGameDataWrites()

    expect(storage?.getItem(saveDefinition.localStorageKey)).toBe('{"version":1,"score":6}')
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 7 }))
    await flushGameDataWrites()
    expect(mockPut.mock.calls[2]?.[1].operations[0].revision).toBe(3)
  })

  it('does not revive a cleared slot when delete and put responses arrive in reverse order', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const deleteRequest = deferred<unknown>()
    const putRequest = deferred<unknown>()
    mockPut
      .mockImplementationOnce(() => deleteRequest.promise)
      .mockImplementationOnce(() => putRequest.promise)
    const storage = gameDataStorage()

    storage?.removeItem(saveDefinition.localStorageKey)
    jest.advanceTimersByTime(0)
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    window.dispatchEvent(new Event('pagehide'))

    putRequest.resolve(batchResult('put', 'saved', { version: 1, score: 5 }, 3))
    await Promise.resolve()
    deleteRequest.resolve(batchResult('delete', 'deleted', {}, 2, true))
    await flushGameDataWrites()

    expect(storage?.getItem(saveDefinition.localStorageKey)).toBe('{"version":1,"score":5}')
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    await flushGameDataWrites()
    expect(mockPut.mock.calls[2]?.[1].operations[0].revision).toBe(3)
  })

  it('batches completed progress before deleting its active save', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([progressDefinition, saveDefinition])
    const storage = gameDataStorage()

    storage?.setItem(progressDefinition.localStorageKey, JSON.stringify({ version: 1, score: 8 }))
    storage?.removeItem(saveDefinition.localStorageKey)
    await flushGameDataWrites()

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0]?.[1]).toEqual({
      operations: [
        {
          action: 'put',
          scope: 'profile',
          slot: 'default',
          data: { version: 1, score: 8 },
          revision: null,
        },
        {
          action: 'delete',
          scope: 'save',
          slot: 'autosave',
          revision: 1,
          writer_id: expect.any(String),
          writer_sequence: 1,
        },
      ],
    })
  })

  it('treats an identical stale writer-tagged save as a cross-writer conflict', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    mockPut.mockResolvedValueOnce({
      data: [{
        action: 'put',
        scope: 'save',
        slot: 'autosave',
        status: 'stale',
        row: { ...row('marble-sort', 'save', 'autosave', { version: 1, score: 5 }), revision: 2 },
      }],
    })
    const conflictListener = jest.fn()
    window.addEventListener('game-data-conflict', conflictListener)

    gameDataStorage()?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    await flushGameDataWrites()
    gameDataStorage()?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    await flushGameDataWrites()

    expect(conflictListener).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledTimes(1)
    window.removeEventListener('game-data-conflict', conflictListener)
  })

  it('accepts a same-writer superseded save without raising a conflict', async () => {
    installAuthentication(true)
    mockIndexResponse({
      data: [row('marble-sort', 'save', 'autosave', { version: 1, score: 4 })],
    })
    await initializeGameDataPersistence([saveDefinition])
    const conflictListener = jest.fn()
    window.addEventListener('game-data-conflict', conflictListener)
    mockPut.mockResolvedValueOnce(batchResult('put', 'superseded', { version: 1, score: 7 }, 2))
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    await flushGameDataWrites()

    expect(conflictListener).not.toHaveBeenCalled()
    expect(storage?.getItem(saveDefinition.localStorageKey)).toBe('{"version":1,"score":7}')
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 8 }))
    await flushGameDataWrites()
    expect(mockPut.mock.calls[1]?.[1].operations[0].revision).toBe(2)
    window.removeEventListener('game-data-conflict', conflictListener)
  })

  it('purges mutable inventory writes after an active-save conflict', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [
        row('marble-sort', 'profile', 'inventory', { version: 1, score: 4 }),
        row('marble-sort', 'save', 'autosave', { version: 1, score: 4 }),
      ],
    })
    await initializeGameDataPersistence([inventoryDefinition, saveDefinition])
    const conflictListener = jest.fn()
    window.addEventListener('game-data-conflict', conflictListener)
    let resolveFirst: (value: unknown) => void = () => {
      throw new Error('Autosave did not start.')
    }
    mockPut.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve
    }))
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    await jest.advanceTimersByTimeAsync(2_000)
    storage?.setItem(inventoryDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    resolveFirst({
      data: [{
        action: 'put',
        scope: 'save',
        slot: 'autosave',
        status: 'stale',
        row: { ...row('marble-sort', 'save', 'autosave', { version: 1, score: 9 }), revision: 2 },
      }],
    })
    await flushGameDataWrites()

    expect(conflictListener).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledTimes(1)

    storage?.setItem(inventoryDefinition.localStorageKey, JSON.stringify({ version: 1, score: 7 }))
    await flushGameDataWrites()
    expect(mockPut).toHaveBeenCalledTimes(1)
    window.removeEventListener('game-data-conflict', conflictListener)
  })

  it('does not retry a failed future save batch after an earlier save detects a conflict', async () => {
    jest.useFakeTimers()
    installAuthentication(true)
    mockIndexResponse({
      data: [
        row('marble-sort', 'profile', 'inventory', { version: 1, score: 4 }),
        row('marble-sort', 'save', 'autosave', { version: 1, score: 4 }),
      ],
    })
    await initializeGameDataPersistence([inventoryDefinition, saveDefinition])
    const firstRequest = deferred<unknown>()
    const futureRequest = deferred<unknown>()
    mockPut
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => futureRequest.promise)
    const conflictListener = jest.fn()
    window.addEventListener('game-data-conflict', conflictListener)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = gameDataStorage()

    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 5 }))
    jest.advanceTimersByTime(2_000)
    storage?.setItem(inventoryDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    storage?.setItem(saveDefinition.localStorageKey, JSON.stringify({ version: 1, score: 6 }))
    window.dispatchEvent(new Event('pagehide'))
    futureRequest.reject('response lost')
    await Promise.resolve()
    await Promise.resolve()
    firstRequest.resolve({
      data: [{
        action: 'put',
        scope: 'save',
        slot: 'autosave',
        status: 'stale',
        row: { ...row('marble-sort', 'save', 'autosave', { version: 1, score: 9 }), revision: 2 },
      }],
    })
    await flushGameDataWrites()

    expect(conflictListener).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledTimes(2)
    window.removeEventListener('game-data-conflict', conflictListener)
    errorSpy.mockRestore()
  })

  it('does not enable Tower Throwback yet', () => {
    expect(DATABASE_GAME_SLUGS).not.toContain('tower-throwback')
  })
})

function installAuthentication(authenticated: boolean): void {
  const script = document.createElement('script')
  script.id = 'app-initial-data'
  script.type = 'application/json'
  script.textContent = JSON.stringify({
    authenticated,
    currentUser: authenticated ? { id: 7 } : null,
  })
  document.body.appendChild(script)
}

function installCachedShell(): void {
  const script = document.createElement('script')
  script.id = 'app-initial-data'
  script.type = 'application/json'
  script.textContent = JSON.stringify({
    authenticated: false,
    currentUser: null,
    pwaCachedShell: true,
  })
  document.body.appendChild(script)
}

function findServerShadowKey(): string | undefined {
  return Object.keys(window.localStorage)
    .find((key) => key.startsWith('bwh.games.server-state.v1.'))
}

function row(
  game: 'block-blaster' | 'marble-sort',
  scope: 'profile' | 'save',
  slot: string,
  data: Record<string, unknown>,
) {
  return {
    game,
    scope,
    slot,
    data,
    updated_at: '2026-07-10T12:00:00Z',
    revision: 1,
  }
}

interface BatchOperation {
  action: 'put' | 'delete'
  scope: 'profile' | 'level' | 'save'
  slot: string
  revision: number | null
  data?: Record<string, unknown>
  writer_id?: string
  writer_sequence?: number
}

interface BatchBody {
  operations: BatchOperation[]
}

function batchResponse(url: string, body: BatchBody) {
  const parts = url.split('/')
  const game = parts[3] as 'block-blaster' | 'marble-sort'

  return {
    data: body.operations.map((operation) => ({
      action: operation.action,
      scope: operation.scope,
      slot: operation.slot,
      status: operation.action === 'put' ? 'saved' : 'deleted',
      row: {
        ...row(game, operation.scope as 'profile' | 'save', operation.slot, operation.data ?? {}),
        data: operation.action === 'put' ? operation.data ?? {} : {},
        is_deleted: operation.action === 'delete',
        revision: (operation.revision ?? 0) + 1,
      },
    })),
  }
}

function batchResult(
  action: 'put' | 'delete',
  status: 'saved' | 'superseded' | 'deleted',
  data: Record<string, unknown>,
  revision: number,
  isDeleted = false,
) {
  return {
    data: [{
      action,
      scope: 'save',
      slot: 'autosave',
      status,
      row: {
        ...row('marble-sort', 'save', 'autosave', data),
        data,
        is_deleted: isDeleted,
        revision,
      },
    }],
  }
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred promise was not initialized.')
  }
  let reject: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise was not initialized.')
  }
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
