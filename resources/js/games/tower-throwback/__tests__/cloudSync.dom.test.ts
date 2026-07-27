import { fetchWrapper } from '@/fetchWrapper'

import {
  acquireLease,
  getCloudSlot,
  isCloudSyncEnabled,
  listCloudSlots,
  pushCloudSlot,
} from '../cloudSync'
import { createEngineState } from '../engine/engine'
import { buildScenario } from '../engine/scenarios'
import { loadSandbox, restoreSandbox, type SavedSandbox, saveSandbox } from '../gameProgress'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    postRaw: jest.fn(),
    putRaw: jest.fn(),
    delete: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPutRaw = fetchWrapper.putRaw as jest.Mock
const mockPostRaw = fetchWrapper.postRaw as jest.Mock

function meta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slot: 'slot-a',
    saved: true,
    wire_version: 2,
    game_day: 5,
    star: 3,
    population: 100,
    funds: 42,
    updated_at: '2026-07-16T00:00:00+00:00',
    lease_active: true,
    lease_acquired_at: '2026-07-16T00:00:00+00:00',
    lease_expires_at: '2026-07-16T00:10:00+00:00',
    ...overrides,
  }
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function localRoundTrip(): SavedSandbox {
  const state = createEngineState({ seed: 1, mapId: 'city-tower', lobbyHeight: 1 })
  expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
  const saved = loadSandbox('slot-a')
  expect(saved).not.toBeNull()
  return saved as SavedSandbox
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
})

describe('cloudSync round-trip', () => {
  it('a cloud round-trip yields the same save the local round-trip produced', async () => {
    const local = localRoundTrip()

    let storedPayload: unknown
    mockPutRaw.mockImplementation(async (_url: string, body: { payload: unknown }) => {
      storedPayload = body.payload
      return response(200, { data: meta({ lease_token: 'tok' }) })
    })

    const push = await pushCloudSlot({
      slot: 'slot-a',
      payload: local,
      wireVersion: local.version,
      token: 'tok',
      game_day: local.clock.day,
      star: local.star,
      population: 0,
      funds: local.funds,
    })
    expect(push).toMatchObject({ ok: true, token: 'tok' })

    // The server hands the opaque blob straight back on the next read.
    mockGet.mockResolvedValue({ data: meta({ payload: JSON.parse(JSON.stringify(storedPayload)) }) })
    const cloud = await getCloudSlot('slot-a')

    expect(cloud?.payload).toEqual(local)
  })

  it('preserves Niagara and its Observation Deck through the cloud payload', async () => {
    const state = buildScenario('niagara', 1676)
    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    const local = loadSandbox('slot-a')
    expect(local).not.toBeNull()

    let storedPayload: unknown
    mockPutRaw.mockImplementation(async (_url: string, body: { payload: unknown }) => {
      storedPayload = body.payload
      return response(200, { data: meta({ lease_token: 'tok' }) })
    })

    const push = await pushCloudSlot({
      slot: 'slot-a',
      payload: local!,
      wireVersion: local!.version,
      token: 'tok',
      game_day: local!.clock.day,
      star: local!.star,
      population: 0,
      funds: local!.funds,
    })
    expect(push).toMatchObject({ ok: true })

    mockGet.mockResolvedValue({ data: meta({ payload: JSON.parse(JSON.stringify(storedPayload)) }) })
    const cloud = await getCloudSlot('slot-a')
    const cloudPayload = cloud?.payload as SavedSandbox | undefined
    expect(cloudPayload?.mapId).toBe('niagara-falls')

    const restored = restoreSandbox(cloudPayload!)
    expect(restored.mapId).toBe('niagara-falls')
    expect(restored.units.some((unit) => unit.kind === 'observationDeck')).toBe(true)
  })
})

describe('cloudSync offline fallback', () => {
  it('a network error leaves the local save intact and reports offline', async () => {
    const local = localRoundTrip()
    mockPutRaw.mockRejectedValue(new TypeError('Failed to fetch'))

    const push = await pushCloudSlot({
      slot: 'slot-a',
      payload: local,
      wireVersion: local.version,
      token: 'tok',
      game_day: local.clock.day,
      star: local.star,
      population: 0,
      funds: local.funds,
    })

    expect(push).toEqual({ ok: false, reason: 'offline' })
    // localStorage remains the source of truth after a failed push.
    expect(loadSandbox('slot-a')).toEqual(local)
  })

  it('reports offline when the slot list cannot be fetched', async () => {
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await listCloudSlots()).toBeNull()
  })
})

describe('cloudSync conflict path', () => {
  it('surfaces a 409 write as a conflict with holder timestamps', async () => {
    mockPutRaw.mockResolvedValue(
      response(409, { message: 'busy', conflict: { acquired_at: 'A', expires_at: 'B' } }),
    )

    const push = await pushCloudSlot({
      slot: 'slot-a',
      payload: { version: 2 },
      wireVersion: 2,
      token: 'stale',
      game_day: 1,
      star: 1,
      population: 0,
      funds: 0,
    })

    expect(push).toEqual({ ok: false, reason: 'conflict', conflict: { acquired_at: 'A', expires_at: 'B' } })
  })

  it('surfaces a 409 acquire as a conflict, and a 200 acquire as a fresh token', async () => {
    mockPostRaw.mockResolvedValueOnce(
      response(409, { conflict: { acquired_at: 'A', expires_at: 'B' } }),
    )
    expect(await acquireLease('slot-a')).toEqual({
      ok: false,
      reason: 'conflict',
      conflict: { acquired_at: 'A', expires_at: 'B' },
    })

    mockPostRaw.mockResolvedValueOnce(response(200, { data: meta({ lease_token: 'fresh' }) }))
    expect(await acquireLease('slot-a', { force: true })).toMatchObject({ ok: true, token: 'fresh' })
  })
})

describe('cloudSync zod validation', () => {
  it('rejects a malformed slot payload envelope', async () => {
    mockGet.mockResolvedValue({ data: { slot: 'slot-a', saved: 'not-a-boolean' } })
    expect(await getCloudSlot('slot-a')).toBeNull()
  })

  it('rejects a malformed slot list', async () => {
    mockGet.mockResolvedValue({ data: [{ unexpected: true }] })
    expect(await listCloudSlots()).toBeNull()
  })
})

describe('isCloudSyncEnabled', () => {
  afterEach(() => {
    document.getElementById('app-initial-data')?.remove()
  })

  it('is true only when the app boot data marks the player authenticated', () => {
    const script = document.createElement('script')
    script.id = 'app-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify({ authenticated: true })
    document.body.appendChild(script)
    expect(isCloudSyncEnabled()).toBe(true)

    script.textContent = JSON.stringify({ authenticated: false })
    expect(isCloudSyncEnabled()).toBe(false)
  })

  it('is false when there is no boot data', () => {
    expect(isCloudSyncEnabled()).toBe(false)
  })
})
