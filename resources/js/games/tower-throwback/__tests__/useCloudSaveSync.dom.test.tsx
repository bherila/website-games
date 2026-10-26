/**
 * Item 2: the cloud status must describe what actually happened.
 *
 * Before this, `synced` meant only "a local copy exists AND a cloud copy
 * exists", so a slot stayed green while every push failed. These tests pin the
 * states that replaced that lie.
 */
import { act, render } from '@testing-library/react'
import { type ReactElement, useEffect } from 'react'

import { CLOUD_ENVELOPE_FORMAT, CLOUD_ENVELOPE_WIRE_VERSION, decodeCloudPayload, encodeCloudPayload } from '../cloudPayload'
import * as cloudSync from '../cloudSync'
import { createEngineState } from '../engine/engine'
import { clearSandbox, importSandbox, loadSandbox, migrateSandboxPayload, type SavedSandbox, saveSandbox } from '../gameProgress'
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

/**
 * Padding that stays over the cloud budget AFTER the v3 envelope's gzip:
 * pseudo-random characters barely compress, where `'x'.repeat(n)` shrinks to
 * almost nothing.
 */
function incompressible(length: number): string {
  let seed = 0x2545f491
  let out = ''
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    out += String.fromCharCode(33 + ((seed >>> 16) % 94))
  }
  return out
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
      api().pushSlot('slot-a', savedSandbox(incompressible(MAX_CLOUD_PAYLOAD_BYTES * 2)))
    })

    expect(api().slots['slot-a'].status).toBe('tooLarge')
    // No request at all: the server would only 422 it, and that failure used to
    // be invisible.
    expect(mocked.pushCloudSlot).not.toHaveBeenCalled()
  })

  it('does not apply a persisted outcome to an empty local slot', async () => {
    const firstView = await renderSync()
    await act(async () => {
      api().pushSlot('slot-a', savedSandbox(incompressible(MAX_CLOUD_PAYLOAD_BYTES * 2)))
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

describe('useCloudSaveSync compressed (v3) cloud payloads', () => {
  it('pushes the save as a gzip envelope under wire version 3', async () => {
    await renderSync()
    const saved = savedSandbox()
    await act(async () => {
      api().pushSlot('slot-a', saved)
    })

    const input = mocked.pushCloudSlot.mock.calls[0]![0]
    expect(input.wireVersion).toBe(CLOUD_ENVELOPE_WIRE_VERSION)
    expect(input.payload).toEqual({ format: CLOUD_ENVELOPE_FORMAT, version: 3, data: expect.any(String) })
    expect(decodeCloudPayload(input.payload)).toEqual(JSON.parse(JSON.stringify(saved)))
  })

  it('restores a compressed cloud save and an older uncompressed one', async () => {
    const saved = savedSandbox()
    clearSandbox('slot-a')
    await renderSync(new Set<SandboxSlotId>())
    for (const payload of [encodeCloudPayload(JSON.stringify(saved)), JSON.parse(JSON.stringify(saved)) as unknown]) {
      mocked.getCloudSlot.mockResolvedValueOnce({ meta: slotMeta(), payload })
      let restored: SavedSandbox | null = null
      await act(async () => {
        restored = await api().restore('slot-a')
      })
      expect(restored).toEqual(saved)
      expect(loadSandbox('slot-a')).toEqual(saved)
      clearSandbox('slot-a')
    }
  })

  it('refuses an envelope from a newer client without touching the local save', async () => {
    const local = savedSandbox()
    const localBytes = localStorage.getItem('bwh.tower-throwback.sandbox.v1.slot-a')
    await renderSync()
    const newer = { ...encodeCloudPayload(JSON.stringify(local)), version: 4 }
    for (const payload of [newer, { ...newer, version: 3, format: 'tower-throwback/zstd' }, { ...newer, version: 3, data: 'not base64 gzip' }]) {
      mocked.getCloudSlot.mockResolvedValueOnce({ meta: slotMeta(), payload })
      let restored: SavedSandbox | null = local
      await act(async () => {
        restored = await api().restore('slot-a')
      })
      expect(restored).toBeNull()
      expect(localStorage.getItem('bwh.tower-throwback.sandbox.v1.slot-a')).toBe(localBytes)
    }
  })

  it('an older client meeting a v3 envelope refuses it safely', () => {
    // Pre-v3 restore handed the raw cloud payload straight to the migration and
    // the importer. Both must reject the envelope and leave the slot alone.
    const local = savedSandbox()
    const localBytes = localStorage.getItem('bwh.tower-throwback.sandbox.v1.slot-a')
    const envelope = encodeCloudPayload(JSON.stringify(local))

    expect(migrateSandboxPayload(envelope)).toBeNull()
    expect(importSandbox(JSON.stringify(envelope), 'slot-a')).toEqual({ ok: false, reason: 'invalidPayload' })
    expect(localStorage.getItem('bwh.tower-throwback.sandbox.v1.slot-a')).toBe(localBytes)
  })
})
