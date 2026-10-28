import { fetchWrapper } from '@/fetchWrapper'

import { definitionRowKey, flushGameDataWrites, gameDataStorage, initializeGameDataPersistence, resetGameDataPersistenceForTests } from '../../_shared/gameDataPersistence'
import { Building, starterBuilding } from '../engine/building'
import { parseTowerSave, TOWER_2_SAVE_DATA, TOWER_2_SAVE_SLOT, TOWER_2_STORAGE_KEY } from '../gameProgress'
import { loadBuilding } from '../useWorld'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { delete: jest.fn(), get: jest.fn(), getRaw: jest.fn(), put: jest.fn() },
}))

const mockGet = fetchWrapper.getRaw as jest.Mock
const mockPut = fetchWrapper.put as jest.Mock

function serverRows(rows: unknown[]): void {
  mockGet.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => ({ data: rows }) } as Response)
}

function signIn(): void {
  const script = document.createElement('script')
  script.id = 'app-initial-data'
  script.type = 'application/json'
  script.textContent = JSON.stringify({ authenticated: true, currentUser: { id: 7 } })
  document.body.appendChild(script)
}

/** What the server answers for a batch: every put saved at revision 1. */
function acceptBatches(): void {
  mockPut.mockImplementation(async (url: string, body: { operations: { action: string, scope: string, slot: string, data: Record<string, unknown> }[] }) => ({
    data: body.operations.map((operation) => ({
      action: operation.action,
      scope: operation.scope,
      slot: operation.slot,
      status: 'saved',
      row: { game: 'tower-2', scope: operation.scope, slot: operation.slot, data: operation.data, is_deleted: false, revision: 1, updated_at: null },
    })),
  }))
}

describe('the Tower 2 save', () => {
  beforeEach(() => {
    resetGameDataPersistenceForTests()
    window.localStorage.clear()
    document.getElementById('app-initial-data')?.remove()
    mockGet.mockReset()
    mockPut.mockReset()
  })

  afterEach(() => resetGameDataPersistenceForTests())

  test('parses current and older snapshots into the current version, and refuses anything that does not replay', () => {
    const snapshot = starterBuilding().snapshot()
    expect(parseTowerSave(snapshot)).toEqual(snapshot)
    expect(parseTowerSave(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(parseTowerSave(null)).toBeNull()
    expect(parseTowerSave({ version: 9 })).toBeNull()
    expect(parseTowerSave({ ...snapshot, rooms: [...snapshot.rooms, { ...snapshot.rooms[0]!, id: 99 }] })).toBeNull()
  })

  test('is one tower in the main save slot', () => {
    const snapshot = starterBuilding().snapshot()
    expect(TOWER_2_SAVE_DATA.encode(snapshot)).toEqual([{ scope: 'save', slot: TOWER_2_SAVE_SLOT, data: snapshot }])
    const rows = new Map([[definitionRowKey('save', TOWER_2_SAVE_SLOT), { game: 'tower-2' as const, scope: 'save' as const, slot: TOWER_2_SAVE_SLOT, data: snapshot as unknown as Record<string, unknown>, revision: 1, updatedAt: null }]])
    expect(TOWER_2_SAVE_DATA.decode(rows)).toEqual(snapshot)
    expect(TOWER_2_SAVE_DATA.clearSlots).toEqual([{ scope: 'save', slot: TOWER_2_SAVE_SLOT }])
  })

  test('a signed-in player loads the tower saved in their account', async () => {
    signIn()
    const snapshot = starterBuilding().snapshot()
    serverRows([{ game: 'tower-2', scope: 'save', slot: 'main', data: snapshot, is_deleted: false, revision: 3, updated_at: null }])
    await initializeGameDataPersistence([TOWER_2_SAVE_DATA])
    const { building, fresh } = loadBuilding(gameDataStorage())
    expect(fresh).toBe(false)
    expect(building.snapshot()).toEqual(snapshot)
  })

  test('on first sign-in, the tower built in this browser moves into the account', async () => {
    const local = new Building()
    local.paintPlate(0, [{ x: 3, y: 3 }, { x: 4, y: 3 }])
    window.localStorage.setItem(TOWER_2_STORAGE_KEY, JSON.stringify(local.snapshot()))
    signIn()
    serverRows([])
    acceptBatches()
    await initializeGameDataPersistence([TOWER_2_SAVE_DATA])
    expect(mockPut).toHaveBeenCalledWith('/api/games/tower-2/data', expect.objectContaining({
      operations: [expect.objectContaining({ action: 'put', scope: 'save', slot: 'main', data: local.snapshot() })],
    }))
    expect(loadBuilding(gameDataStorage()).building.plateArea(0)).toBe(2)
  })

  test('edits a signed-in player makes are written to the account', async () => {
    signIn()
    serverRows([])
    acceptBatches()
    await initializeGameDataPersistence([TOWER_2_SAVE_DATA])
    const tower = starterBuilding()
    gameDataStorage()?.setItem(TOWER_2_STORAGE_KEY, JSON.stringify(tower.snapshot()))
    await flushGameDataWrites()
    const [url, body] = mockPut.mock.lastCall as [string, { operations: unknown[] }]
    expect(url).toBe('/api/games/tower-2/data')
    expect(body.operations).toEqual([expect.objectContaining({ action: 'put', scope: 'save', slot: 'main', data: tower.snapshot() })])
  })
})
