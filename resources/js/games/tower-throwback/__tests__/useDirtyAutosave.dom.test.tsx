import { act, render } from '@testing-library/react'
import { type ReactElement, useEffect } from 'react'

import { AUTOSAVE_MAX_UNSAVED_MS, AUTOSAVE_QUIET_MS, type SaveHealth } from '../saveHealth'
import { type AutosaveOutcome, useDirtyAutosave } from '../useDirtyAutosave'

const published: { current: { health: SaveHealth; markDirty: () => void; flush: () => void } | null } = { current: null }

function api() {
  if (!published.current) {
    throw new Error('harness has not rendered')
  }
  return published.current
}

let clock = 0
const now = (): number => clock

function advance(ms: number): void {
  act(() => {
    clock += ms
    jest.advanceTimersByTime(ms)
  })
}

function Harness({ save, enabled = true }: { save: () => AutosaveOutcome; enabled?: boolean }): ReactElement {
  const autosave = useDirtyAutosave({ save, enabled, now })
  useEffect(() => {
    published.current = autosave
  }, [autosave])
  return <span data-testid="status">{autosave.health.status}</span>
}

beforeEach(() => {
  jest.useFakeTimers()
  clock = 0
  published.current = null
})

afterEach(() => {
  jest.useRealTimers()
})

const ok = (): AutosaveOutcome => ({ ok: true })

describe('useDirtyAutosave', () => {
  it('does not write until the quiet window elapses', () => {
    const save = jest.fn(ok)
    render(<Harness save={save} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS - 1_000)
    expect(save).not.toHaveBeenCalled()

    advance(2_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of commands into one write', () => {
    const save = jest.fn(ok)
    render(<Harness save={save} />)

    for (let i = 0; i < 40; i++) {
      act(() => api().markDirty())
      advance(100)
    }
    advance(AUTOSAVE_QUIET_MS)

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('bounds the unsaved window under continuous activity', () => {
    const save = jest.fn(ok)
    render(<Harness save={save} />)

    // Never quiet for long enough to trip the debounce on its own.
    for (let elapsed = 0; elapsed < AUTOSAVE_MAX_UNSAVED_MS + 2_000; elapsed += 1_000) {
      act(() => api().markDirty())
      advance(1_000)
    }

    expect(save).toHaveBeenCalled()
  })

  it('reports saved state with the time of the successful write', () => {
    render(<Harness save={ok} />)

    act(() => api().markDirty())
    expect(api().health.status).toBe('pending')

    advance(AUTOSAVE_QUIET_MS)

    expect(api().health.status).toBe('saved')
    expect(api().health.lastSavedAt).toBe(clock)
  })

  it('keeps a failed write visibly failed', () => {
    const save = jest.fn((): AutosaveOutcome => ({ ok: false, error: 'Browser storage is full.', conflict: false }))
    render(<Harness save={save} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS)

    expect(api().health.status).toBe('failed')
    expect(api().health.error).toBe('Browser storage is full.')

    // A later dirtying command must not paper over the failure.
    act(() => api().markDirty())
    expect(api().health.status).toBe('failed')
  })

  it('preserves the last successful time across a later failure', () => {
    let fail = false
    const save = jest.fn((): AutosaveOutcome => (fail ? { ok: false, error: 'nope', conflict: false } : { ok: true }))
    render(<Harness save={save} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS)
    const savedAt = api().health.lastSavedAt
    expect(savedAt).not.toBeNull()

    fail = true
    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS)

    expect(api().health.status).toBe('failed')
    expect(api().health.lastSavedAt).toBe(savedAt)
  })

  it('does not present an ownership conflict as a save failure', () => {
    // The caller tears the session down for conflicts; showing "save failed"
    // as well would be a second, misleading alarm.
    const save = jest.fn((): AutosaveOutcome => ({ ok: false, error: 'other tab', conflict: true }))
    render(<Harness save={save} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS)

    expect(api().health.status).toBe('idle')
    expect(api().health.error).toBeNull()
  })

  it('stops autosaving entirely when disabled', () => {
    const save = jest.fn(ok)
    render(<Harness save={save} enabled={false} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_MAX_UNSAVED_MS * 2)

    expect(save).not.toHaveBeenCalled()
  })

  it('flushes a pending write on unmount', () => {
    const save = jest.fn(ok)
    const view = render(<Harness save={save} />)

    act(() => api().markDirty())
    view.unmount()

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not write on unmount when the tower is clean', () => {
    const save = jest.fn(ok)
    const view = render(<Harness save={save} />)

    act(() => api().markDirty())
    advance(AUTOSAVE_QUIET_MS)
    expect(save).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('writes immediately on flush', () => {
    const save = jest.fn(ok)
    render(<Harness save={save} />)

    act(() => api().markDirty())
    act(() => api().flush())

    expect(save).toHaveBeenCalledTimes(1)
    // The flush cleared the dirty flag, so the debounce has nothing left to do.
    advance(AUTOSAVE_QUIET_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
