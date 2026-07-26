/**
 * Item 2: the cloud status must describe what actually happened.
 *
 * Before this, `synced` meant only "a local copy exists AND a cloud copy
 * exists", so a slot stayed green while every push failed. These tests pin the
 * states that replaced that lie.
 */
import { act, render } from '@testing-library/react'
import { type ReactElement, useEffect } from 'react'

import * as cloudSync from '../cloudSync'
import { createEngineState } from '../engine/engine'
import { clearSandbox, loadSandbox, type SavedSandbox, saveSandbox } from '../gameProgress'
import type { SandboxSlotId } from '../gameTypes'
import { MAX_CLOUD_PAYLOAD_BYTES } from '../saveBudget'
import { type CloudSaveSync, useCloudSaveSync } from '../useCloudSaveSync'

jest.mock('../cloudSync', () => ({
  ...jest.requireActual('../cloudSync'),
  isCloudSyncEnabled: jest.fn(() => true),
  listCloudSlots: jest.fn(),
  acquireLease: jest.fn(),
  pushCloudSlot: jest.fn(),
  getCloudSlot: jest.fn(),
  deleteCloudSlot: jest.fn(),
  releaseLease: jest.fn(),
}))

const mocked = cloudSync as jest.Mocked<typeof cloudSync>

function slotMeta(overrides: Partial<cloudSync.CloudSlotMeta> = {}): cloudSync.CloudSlotMeta {
  return {
    slot: 'slot-a',
    saved: true,
    wire_version: 2,
    game_day: 3,
    star: 2,
    population: 10,
    funds: 100,
    updated_at: '2026-07-19T12:00:00+00:00',
    lease_active: true,
    lease_acquired_at: null,
    lease_expires_at: null,
    lease_token: 'token-1',
    ...overrides,
  }
}

/**
 * A real SavedSandbox via the production serializer. Building one by hand from
 * `EngineState` would drag in the grid layers the wire format deliberately
 * excludes, and would blow the cloud budget on an empty tower.
 */
function savedSandbox(padding = ''): SavedSandbox {
  const state = createEngineState({ seed: 1, mapId: 'city-tower', lobbyHeight: 1 })
  saveSandbox(state, 'slot-a')
  const saved = loadSandbox('slot-a')
  if (!saved) {
    throw new Error('failed to build a SavedSandbox fixture')
  }
  if (padding) {
    // Inflate the payload without changing what the wire shape means.
    ;(saved as unknown as Record<string, unknown>).__padding = padding
  }
  return saved
}

const published: { current: CloudSaveSync | null } = { current: null }

function api(): CloudSaveSync {
  if (!published.current) {
    throw new Error('harness has not rendered')
  }
  return published.current
}

function Harness({ localSaved }: { localSaved: ReadonlySet<SandboxSlotId> }): ReactElement {
  const sync = useCloudSaveSync(localSaved)
  useEffect(() => {
    published.current = sync
  }, [sync])
  return <span data-testid="status">{sync.slots['slot-a'].status}</span>
}

async function renderSync(localSaved: ReadonlySet<SandboxSlotId> = new Set<SandboxSlotId>(['slot-a'])) {
  const view = render(<Harness localSaved={localSaved} />)
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  published.current = null
  mocked.isCloudSyncEnabled.mockReturnValue(true)
  mocked.listCloudSlots.mockResolvedValue([slotMeta()])
  mocked.acquireLease.mockResolvedValue({ ok: true, token: 'token-1', meta: slotMeta() })
  mocked.pushCloudSlot.mockResolvedValue({ ok: true, token: 'token-1', meta: slotMeta() })
})

describe('useCloudSaveSync status truthfulness', () => {
  it('treats local and cloud existence without equality proof as stale', async () => {
    savedSandbox()
    await renderSync()

    expect(api().slots['slot-a'].status).toBe('stale')
    expect(api().slots['slot-a'].canRetry).toBe(true)
  })

  it('reports synced after a push that actually succeeded', async () => {
    await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })

    expect(api().slots['slot-a'].status).toBe('synced')
    expect(api().slots['slot-a'].cloudUpdatedAt).toBe('2026-07-19T12:00:00+00:00')
  })

  it('reports a failed push instead of swallowing it', async () => {
    mocked.pushCloudSlot.mockResolvedValue({ ok: false, reason: 'error' })
    await renderSync()

    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })

    // This is the regression: previously the slot stayed "synced" here.
    expect(api().slots['slot-a'].status).toBe('failed')
    expect(api().slots['slot-a'].canRetry).toBe(true)
  })

  it('recovers to synced when a retry succeeds', async () => {
    mocked.pushCloudSlot.mockResolvedValueOnce({ ok: false, reason: 'offline' })
    await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })
    expect(api().slots['slot-a'].status).toBe('failed')

    await act(async () => {
      api().retry('slot-a')
    })

    expect(api().slots['slot-a'].status).toBe('synced')
    expect(mocked.pushCloudSlot).toHaveBeenCalledTimes(2)
  })

  it('remembers proven equality across a page remount', async () => {
    const saved = savedSandbox()
    const firstView = await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', saved)
    })
    expect(api().slots['slot-a'].status).toBe('synced')

    firstView?.unmount()
    published.current = null
    await renderSync()

    expect(api().slots['slot-a'].status).toBe('synced')
  })

  it('reports stale when the local save changes after the proven push', async () => {
    const saved = savedSandbox()
    const firstView = await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', saved)
    })

    firstView?.unmount()
    saved.funds += 1
    expect(saveSandbox({ ...createEngineState({ seed: 1, mapId: 'city-tower', lobbyHeight: 1 }), funds: saved.funds }, 'slot-a').ok).toBe(true)
    published.current = null
    await renderSync()

    expect(api().slots['slot-a'].status).toBe('stale')
  })

  it('reports stale when the cloud revision changes after the proven push', async () => {
    const saved = savedSandbox()
    const firstView = await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', saved)
    })

    firstView?.unmount()
    mocked.listCloudSlots.mockResolvedValue([slotMeta({ updated_at: '2026-07-19T13:00:00+00:00' })])
    published.current = null
    await renderSync()

    expect(api().slots['slot-a'].status).toBe('stale')
  })

  it('ignores an older push completion after a newer push has failed', async () => {
    let resolveOlder: ((result: cloudSync.CloudPushResult) => void) | null = null
    let resolveNewer: ((result: cloudSync.CloudPushResult) => void) | null = null
    mocked.pushCloudSlot
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNewer = resolve }))
    await renderSync()

    const older = savedSandbox()
    const newer = { ...older, funds: older.funds + 1 }
    await act(async () => {
      api().pushSlot('slot-a', older)
      await Promise.resolve()
    })
    await act(async () => {
      api().pushSlot('slot-a', newer)
      await Promise.resolve()
    })

    await act(async () => {
      resolveNewer?.({ ok: false, reason: 'error' })
      await Promise.resolve()
    })
    expect(api().slots['slot-a'].status).toBe('failed')

    await act(async () => {
      resolveOlder?.({ ok: true, token: 'token-1', meta: slotMeta() })
      await Promise.resolve()
    })
    expect(api().slots['slot-a'].status).toBe('failed')
  })

  it('keeps a 409 conflict distinct from an ordinary failure', async () => {
    mocked.pushCloudSlot.mockResolvedValue({
      ok: false,
      reason: 'conflict',
      conflict: { acquired_at: 'A', expires_at: 'B' },
    })
    await renderSync()

    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })

    // Conflict drives the lease take-over flow, not the retry flow.
    expect(api().slots['slot-a'].status).toBe('conflict')
    expect(api().slots['slot-a'].canRetry).toBe(false)
    expect(api().slots['slot-a'].conflict).toEqual({ acquired_at: 'A', expires_at: 'B' })
  })

  it('refuses to push an over-budget save and says why', async () => {
    await renderSync()

    await act(async () => {
      api().pushSlot('slot-a', savedSandbox('x'.repeat(MAX_CLOUD_PAYLOAD_BYTES)))
    })

    expect(api().slots['slot-a'].status).toBe('tooLarge')
    // No request at all: the server would only 422 it, and that failure used to
    // be invisible.
    expect(mocked.pushCloudSlot).not.toHaveBeenCalled()
  })

  it('does not apply a persisted outcome to an empty local slot', async () => {
    const firstView = await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', savedSandbox('x'.repeat(MAX_CLOUD_PAYLOAD_BYTES)))
    })
    expect(api().slots['slot-a'].status).toBe('tooLarge')

    firstView.unmount()
    clearSandbox('slot-a')
    published.current = null
    await renderSync(new Set<SandboxSlotId>())

    expect(api().slots['slot-a'].status).toBe('cloudAvailable')
  })

  it('does not mark a slot synced from mere existence on both sides', async () => {
    // Cloud says a save exists and the local slot is saved, but this session
    // has pushed something newer that failed.
    mocked.pushCloudSlot.mockResolvedValue({ ok: false, reason: 'error' })
    await renderSync()

    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })

    expect(api().slots['slot-a'].status).not.toBe('synced')
  })

  it('leaves the local save authoritative regardless of cloud outcome', async () => {
    mocked.pushCloudSlot.mockResolvedValue({ ok: false, reason: 'error' })
    await renderSync()

    await act(async () => {
      api().pushSlot('slot-a', savedSandbox())
    })

    // Nothing in the failure path touches local storage.
    expect(api().slots['slot-a'].canRestore).toBe(true)
  })
})
