import { fetchWrapper } from '@/fetchWrapper'

import { loadProgress as loadBlockProgress } from '../../block-blaster/gameProgress'
import {
  createInitialProgress as createInitialCarsProgress,
  loadProgress as loadCarsProgress,
} from '../../cars/gameProgress'
import { loadSavedProgress as loadChicksProgress } from '../../chicks-challenge/gameProgress'
import { PROGRESS_STORAGE_KEY } from '../../chicks-challenge/gameTypes'
import { loadSavedProgress as loadHoverProgress, MAP_ORDER } from '../../hover/gameProgress'
import { generateLevel as generateMarbleLevel } from '../../marble-sort/gameEngine'
import {
  createInitialProgress as createInitialMarbleProgress,
  loadProgress as loadMarbleProgress,
  MARBLE_SORT_SNAPSHOT_STORAGE_KEY,
  saveLevelSnapshot as saveMarbleSnapshot,
  saveProgress as saveMarbleProgress,
} from '../../marble-sort/gameProgress'
import { MARBLE_SORT_PROGRESS_STORAGE_KEY } from '../../marble-sort/gameTypes'
import { DATABASE_GAME_DATA, DATABASE_GAME_PROGRESS_DATA } from '../databaseGameData'
import {
  definitionRowKey,
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
const FIRST_MAP = MAP_ORDER[0]!

function mockIndexResponse(body: unknown, status = 200): void {
  mockGet.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response)
}

describe('database-backed game definitions', () => {
  beforeEach(() => {
    resetGameDataPersistenceForTests()
    window.localStorage.clear()
    document.getElementById('app-initial-data')?.remove()
    installAuthenticatedAppData()
    jest.clearAllMocks()
  })

  afterEach(() => {
    resetGameDataPersistenceForTests()
  })

  it('hydrates the five requested games from profile and per-level rows', async () => {
    mockIndexResponse({ data: [
      row('chicks-challenge', 'profile', 'default', { version: 1, unlocked_level: 3 }),
      row('chicks-challenge', 'level', '1', { version: 1, stars: 3, best_moves: 14 }),
      row('block-blaster', 'profile', 'default', { version: 1, unlocked_level: 2 }),
      row('block-blaster', 'level', '1', { version: 1, stars: 2 }),
      row('marble-sort', 'profile', 'default', {
        version: 2,
        unlocked_level: 4,
        total_score: 500,
        high_score: 300,
      }),
      row('marble-sort', 'profile', 'inventory', { version: 2, power_ups: { extraBelt: 1, magnet: 2, shuffle: 3 } }),
      row('marble-sort', 'level', '3', { version: 2, stars: 3, score: 275 }),
      row('parking-pickup', 'profile', 'default', {
        version: 3,
        unlocked_level: 5,
        total_score: 700,
        high_score: 400,
      }),
      row('parking-pickup', 'profile', 'inventory', { version: 3, power_ups: { fill: 1, shuffle: 2, vip: 3 } }),
      row('parking-pickup', 'level', '4', { version: 3, stars: 2, score: 350 }),
      row('hover', 'profile', 'default', { version: 1, best_score: 900, best_round_index: 2 }),
      row('hover', 'level', FIRST_MAP, { version: 1, map: FIRST_MAP, clears: 2 }),
    ] })

    await initializeGameDataPersistence(DATABASE_GAME_DATA)

    expect(loadChicksProgress()).toMatchObject({ unlockedLevel: 3, stars: { 1: 3 }, bestMoves: { 1: 14 } })
    expect(loadBlockProgress()).toMatchObject({ unlockedLevel: 2, stars: { 1: 2 } })
    expect(loadMarbleProgress()).toMatchObject({
      unlockedLevel: 4,
      stars: { 3: 3 },
      levelScores: { 3: 275 },
      totalScore: 500,
    })
    expect(loadCarsProgress()).toMatchObject({
      unlockedLevel: 5,
      stars: { 4: 2 },
      levelScores: { 4: 350 },
      totalScore: 700,
    })
    expect(loadHoverProgress()).toMatchObject({
      bestScore: 900,
      bestRoundIndex: 2,
      mapsCleared: { [FIRST_MAP]: 2 },
    })
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('promotes a legacy Chick save as one profile row and one row per played level', async () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      unlockedLevel: 3,
      stars: { 1: 3, 2: 1 },
      bestMoves: { 1: 12, 2: 24 },
    }))
    mockIndexResponse({ data: [] })
    mockPut.mockImplementation(async (url: string, body: BatchBody) => batchResponse(url, body))

    await initializeGameDataPersistence(DATABASE_GAME_DATA)

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0]?.[0]).toBe('/api/games/chicks-challenge/data')
    expect(mockPut.mock.calls[0]?.[1].operations.map((operation: BatchOperation) => `${operation.scope}/${operation.slot}`)).toEqual([
      'profile/default',
      'level/1',
      'level/2',
    ])
    expect(window.localStorage.getItem(PROGRESS_STORAGE_KEY)).toBeNull()
    expect(loadChicksProgress()).toMatchObject({ unlockedLevel: 3, stars: { 1: 3, 2: 1 } })
  })

  it('retries Marble progress and snapshot as one migration unit', async () => {
    saveMarbleProgress({
      ...createInitialMarbleProgress(),
      highScore: 120,
      levelScores: { 1: 120 },
      stars: { 1: 3 },
      totalScore: 120,
      unlockedLevel: 2,
    })
    saveMarbleSnapshot(generateMarbleLevel(1, 42_000))
    mockIndexResponse({ data: [] })
    mockPut.mockRejectedValueOnce('offline')

    await expect(initializeGameDataPersistence(DATABASE_GAME_DATA)).rejects.toBe('offline')

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0]?.[0]).toBe('/api/games/marble-sort/data')
    expect(mockPut.mock.calls[0]?.[1].operations.map((operation: BatchOperation) => `${operation.scope}/${operation.slot}`)).toEqual([
      'profile/default',
      'profile/inventory',
      'level/1',
      'save/autosave',
    ])
    expect(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)).not.toBeNull()
    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).not.toBeNull()

    mockPut.mockImplementation(async (url: string, body: BatchBody) => batchResponse(url, body))
    await initializeGameDataPersistence(DATABASE_GAME_DATA)

    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(mockPut.mock.calls[1]?.[1].operations.map((operation: BatchOperation) => `${operation.scope}/${operation.slot}`)).toEqual([
      'profile/default',
      'profile/inventory',
      'level/1',
      'save/autosave',
    ])
    expect(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).toBeNull()
    expect(loadMarbleProgress()).toMatchObject({ totalScore: 120, unlockedLevel: 2 })
  })

  it('keeps Marble local progress and snapshot untouched on Game Select before full migration', async () => {
    saveMarbleProgress({
      ...createInitialMarbleProgress(),
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
      totalScore: 120,
      unlockedLevel: 2,
    })
    saveMarbleSnapshot(generateMarbleLevel(1, 42_001))
    mockIndexResponse({ data: [] })

    await initializeGameDataPersistence(DATABASE_GAME_PROGRESS_DATA)

    expect(mockPut).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)).not.toBeNull()
    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).not.toBeNull()

    resetGameDataPersistenceForTests()
    jest.clearAllMocks()
    mockIndexResponse({ data: [] })
    mockPut.mockImplementation(async (url: string, body: BatchBody) => batchResponse(url, body))
    const marbleDefinitions = DATABASE_GAME_DATA.filter((definition) => definition.game === 'marble-sort')

    await initializeGameDataPersistence(marbleDefinitions)

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0]?.[1].operations.map((operation: BatchOperation) => `${operation.scope}/${operation.slot}`)).toEqual([
      'profile/default',
      'profile/inventory',
      'save/autosave',
    ])
    expect(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).toBeNull()
  })

  it('uses catalog definitions that exclude mutable inventory rows', () => {
    const marbleCatalog = DATABASE_GAME_PROGRESS_DATA.find((definition) => definition.game === 'marble-sort')
    const carsCatalog = DATABASE_GAME_PROGRESS_DATA.find((definition) => definition.game === 'parking-pickup')

    expect(marbleCatalog?.promoteLocal).toBe(false)
    expect(marbleCatalog?.encode({
      ...createInitialMarbleProgress(),
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
    }).map(({ scope, slot }) => `${scope}/${slot}`)).toEqual(['profile/default'])
    expect(carsCatalog?.promoteLocal).toBe(false)
    expect(carsCatalog?.encode({
      ...createInitialCarsProgress(),
      powerUps: { fill: 1, shuffle: 2, vip: 3 },
    }).map(({ scope, slot }) => `${scope}/${slot}`)).toEqual(['profile/default'])

    expect(marbleCatalog?.decode(new Map([
      [definitionRowKey('profile', 'default'), normalizedRow('marble-sort', 'profile', 'default', {
        version: 2,
        unlocked_level: 2,
        total_score: 100,
        high_score: 100,
      })],
      [definitionRowKey('profile', 'inventory'), normalizedRow('marble-sort', 'profile', 'inventory', {
        version: 2,
        power_ups: { extraBelt: 9, magnet: 9, shuffle: 9 },
      })],
    ]))).toMatchObject({ powerUps: { extraBelt: 0, magnet: 0, shuffle: 0 } })
  })
})

type TestGame = 'chicks-challenge' | 'block-blaster' | 'marble-sort' | 'parking-pickup' | 'hover'
type TestScope = 'profile' | 'level' | 'save'

function row(game: TestGame, scope: TestScope, slot: string, data: Record<string, unknown>) {
  return { game, scope, slot, data, revision: 1, updated_at: '2026-07-10 12:00:00' }
}

function normalizedRow(game: TestGame, scope: TestScope, slot: string, data: Record<string, unknown>) {
  return { game, scope, slot, data, revision: 1, updatedAt: '2026-07-10 12:00:00' }
}

interface BatchOperation {
  action: 'put' | 'delete'
  scope: TestScope
  slot: string
  revision: number | null
  data?: Record<string, unknown>
}

interface BatchBody {
  operations: BatchOperation[]
}

function batchResponse(url: string, body: BatchBody) {
  const parts = url.split('/')
  const game = parts[3] as TestGame

  return {
    data: body.operations.map((operation) => ({
      action: operation.action,
      scope: operation.scope,
      slot: operation.slot,
      status: operation.action === 'put' ? 'saved' : 'deleted',
      row: operation.action === 'put'
        ? row(game, operation.scope, operation.slot, operation.data ?? {})
        : null,
    })),
  }
}

function installAuthenticatedAppData(): void {
  const script = document.createElement('script')
  script.id = 'app-initial-data'
  script.type = 'application/json'
  script.textContent = JSON.stringify({ authenticated: true })
  document.body.appendChild(script)
}
