import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, useEffect } from 'react'

import type { CloudSlotView } from '../cloudSync'
import { buildHudSnapshot, createEngineState, stepEngine } from '../engine/engine'
import {
  claimSandboxSlot,
  exportSandbox,
  getOrCreateTabSessionId,
  importSandbox,
  loadSandbox,
  sandboxOwnerStorageKey,
  type SavedSandbox,
  saveSandbox,
} from '../gameProgress'
import { SANDBOX_SLOT_IDS, SANDBOX_STORAGE_KEY, type SandboxSlotId } from '../gameTypes'
import { TowerGame } from '../TowerGame'
import type { TowerScene } from '../TowerScene'

const scene: { current: ComponentProps<typeof TowerScene> | null } = { current: null }
const cloud = {
  enabled: true,
  slots: Object.fromEntries(SANDBOX_SLOT_IDS.map((id) => [id, {
    status: 'cloudAvailable', canRestore: true, conflict: null, cloudUpdatedAt: null, canRetry: false,
  }])) as Record<SandboxSlotId, CloudSlotView>,
  openSlot: jest.fn(), pushSlot: jest.fn(), takeOver: jest.fn(), restore: jest.fn(),
  remove: jest.fn(), refresh: jest.fn(), retry: jest.fn(),
}

jest.mock('../useCloudSaveSync', () => ({ useCloudSaveSync: () => cloud }))
jest.mock('../TowerScene', () => ({
  TowerScene: function SceneProbe(props: ComponentProps<typeof TowerScene>) {
    useEffect(() => {
      scene.current = props
    }, [props])
    const { engineState, onSnapshot } = props
    useEffect(() => {
      onSnapshot?.(buildHudSnapshot(engineState))
    }, [engineState, onSnapshot])
    return <div data-testid="scene" />
  },
}))

function runningScene(): ComponentProps<typeof TowerScene> {
  if (!scene.current) throw new Error('No running scene')
  return scene.current
}

function drainCommands(): void {
  const { engineState, commandQueueRef } = runningScene()
  const queue = commandQueueRef.current
  stepEngine(engineState, queue.splice(0, queue.length), 0)
}

function sandboxStorageKey(slot: SandboxSlotId): string {
  return slot === 'autosave' ? SANDBOX_STORAGE_KEY : `${SANDBOX_STORAGE_KEY}.${slot}`
}

function seedSlot(slot: SandboxSlotId, seed: number): string {
  expect(saveSandbox(createEngineState({ seed, mapId: 'city-tower', lobbyHeight: 1 }), slot)).toEqual({ ok: true })
  return localStorage.getItem(sandboxStorageKey(slot))!
}

function resume(slot: SandboxSlotId = 'autosave'): void {
  fireEvent.click(screen.getByTestId(`resume-${slot}`))
  expect(screen.getByTestId('scene')).toBeInTheDocument()
}

function openSaves(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Saves' }))
}

function hiddenTab(): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  fireEvent(document, new Event('visibilitychange'))
}

beforeEach(() => {
  jest.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  jest.clearAllMocks()
  cloud.restore.mockResolvedValue(null)
  scene.current = null
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it.each(['quota', 'unavailable', 'owner-marker'] as const)('keeps the previous autosave and title card after %s failure', (failure) => {
  const previous = seedSlot('autosave', 4242)
  const named = seedSlot('slot-a', 43)
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('start'))
  const realSetItem = Storage.prototype.setItem
  if (failure === 'unavailable') {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Unavailable') })
  } else {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === (failure === 'quota' ? sandboxStorageKey('autosave') : sandboxOwnerStorageKey('autosave'))) {
        throw new DOMException('Full', 'QuotaExceededError')
      }
      realSetItem.call(this, key, value)
    })
  }
  fireEvent.click(screen.getByTestId('start'))
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(failure === 'unavailable' ? 'unavailable' : 'full')
  expect(cloud.pushSlot).not.toHaveBeenCalled()
  jest.restoreAllMocks()
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBeNull()
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(named)
})

it('does not steal another tab’s autosave when starting a replacement', () => {
  const previous = seedSlot('autosave', 4242)
  claimSandboxSlot('autosave', 'other-tab')
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('start'))
  fireEvent.click(screen.getByTestId('start'))
  expect(screen.getByRole('alert')).toHaveTextContent('another tab')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe('other-tab')
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
})

it('preserves the autosave on cancellation and commits a successful replacement', () => {
  const previous = seedSlot('autosave', 4242)
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('start'))
  fireEvent.click(screen.getByTestId('cancel-new'))
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  fireEvent.click(screen.getByTestId('start'))
  fireEvent.click(screen.getByTestId('start'))
  expect(screen.getByTestId('scene')).toBeInTheDocument()
  expect(loadSandbox()?.seed).toBe(runningScene().engineState.seed)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe(getOrCreateTabSessionId())
  expect(cloud.pushSlot).toHaveBeenCalledTimes(1)
})

it.each(['import', 'clear', 'cloud'] as const)('refuses active-slot %s before changing storage and keeps autosaves safe', (operation) => {
  seedSlot('slot-a', 999)
  seedSlot('autosave', 4242)
  const payload = exportSandbox(loadSandbox('slot-a')!)
  const view = render(<TowerGame />)
  resume()
  openSaves()
  const previous = localStorage.getItem(sandboxStorageKey('autosave'))
  const owner = localStorage.getItem(sandboxOwnerStorageKey('autosave'))
  if (operation === 'import') {
    fireEvent.change(screen.getByTestId('import-slot'), { target: { value: 'autosave' } })
    fireEvent.change(screen.getByTestId('import-payload'), { target: { value: payload } })
    fireEvent.click(screen.getByTestId('import-save'))
    fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  } else if (operation === 'clear') {
    fireEvent.click(screen.getByTestId('clear-autosave'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  } else {
    fireEvent.click(screen.getByTestId('cloud-restore-autosave'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
    expect(cloud.restore).not.toHaveBeenCalled()
  }
  expect(screen.getByTestId('save-message')).toHaveTextContent('currently running')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe(owner)
  const callbacks = runningScene()
  act(() => callbacks.onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: false }))
  act(() => jest.advanceTimersByTime(16_000))
  act(() => callbacks.onEvents?.([{ type: 'settlement', day: 1, net: 0 }]))
  hiddenTab()
  view.unmount()
  expect(loadSandbox()?.seed).toBe(4242)
  expect(loadSandbox('slot-a')?.seed).toBe(999)
  expect(cloud.remove).not.toHaveBeenCalled()
})

it('supports inactive imports, failed imports, cancellation and clears without changing the running tower', () => {
  const previous = seedSlot('autosave', 4242)
  seedSlot('slot-a', 999)
  const payload = localStorage.getItem(sandboxStorageKey('slot-a'))!
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.change(screen.getByTestId('import-payload'), { target: { value: 'bad JSON' } })
  fireEvent.click(screen.getByTestId('import-save'))
  fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  expect(loadSandbox('slot-a')?.seed).toBe(999)
  expect(screen.getByTestId('save-message')).toHaveTextContent('malformed')
  fireEvent.change(screen.getByTestId('import-payload'), { target: { value: payload } })
  fireEvent.click(screen.getByTestId('import-save'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  fireEvent.click(screen.getByTestId('import-save'))
  fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Imported')
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(loadSandbox('slot-a')).toBeNull()
  expect(runningScene().engineState.seed).toBe(4242)
  expect(cloud.remove).toHaveBeenCalledWith('slot-a')
})

it('prevents loading or writing a slot while its cloud restore is in flight, then permits loading the restored tower', async () => {
  seedSlot('autosave', 4242)
  const restoredBytes = seedSlot('slot-a', 999)
  let finish!: (saved: SavedSandbox | null) => void
  cloud.restore.mockImplementation(() => new Promise<SavedSandbox | null>((resolve) => { finish = resolve }))
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Wait for the cloud restore')
  expect(runningScene().engineState.seed).toBe(4242)
  fireEvent.click(screen.getByTestId('save-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite save' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Wait for the cloud restore')
  await act(async () => {
    const result = importSandbox(restoredBytes, 'slot-a')
    if (!result.ok) throw new Error('Fixture import failed')
    finish(result.saved)
    await Promise.resolve()
  })
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower' }))
  expect(runningScene().engineState.seed).toBe(999)
  hiddenTab()
  expect(loadSandbox('slot-a')?.seed).toBe(999)
})

it('keeps an existing same-tab ownership marker when a replacement save fails', () => {
  const previous = seedSlot('autosave', 4242)
  const owner = getOrCreateTabSessionId()
  claimSandboxSlot('autosave', owner)
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('start'))
  const realSetItem = Storage.prototype.setItem
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === sandboxStorageKey('autosave')) throw new DOMException('Full', 'QuotaExceededError')
    realSetItem.call(this, key, value)
  })
  fireEvent.click(screen.getByTestId('start'))
  expect(screen.getByRole('alert')).toHaveTextContent('full')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe(owner)
})

it.each(['unavailable', 'rejection'] as const)('releases the slot guard after a cloud %s failure', async (failure) => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  if (failure === 'rejection') cloud.restore.mockRejectedValue(new Error('Offline'))
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
    await Promise.resolve()
  })
  expect(screen.getByTestId('save-message')).toHaveTextContent('Could not restore')
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower' }))
  expect(runningScene().engineState.seed).toBe(999)
})

it.each(['import', 'clear', 'cloud'] as const)('preserves another tab’s inactive slot during %s', (operation) => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  claimSandboxSlot('slot-a', 'other-tab')
  render(<TowerGame />)
  resume()
  openSaves()
  if (operation === 'import') {
    fireEvent.change(screen.getByTestId('import-payload'), { target: { value: exportSandbox(loadSandbox()!) } })
    fireEvent.click(screen.getByTestId('import-save'))
    fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  } else if (operation === 'clear') {
    fireEvent.click(screen.getByTestId('clear-slot-a'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  } else {
    fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
  }
  expect(screen.getByTestId('save-message')).toHaveTextContent('another tab')
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBe('other-tab')
  expect(cloud.restore).not.toHaveBeenCalled()
  expect(cloud.remove).not.toHaveBeenCalled()
})

it('preserves an inactive slot and its ownership when an import write fails', () => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.change(screen.getByTestId('import-payload'), { target: { value: exportSandbox(loadSandbox()!) } })
  fireEvent.click(screen.getByTestId('import-save'))
  const realSetItem = Storage.prototype.setItem
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === sandboxStorageKey('slot-a')) throw new DOMException('Full', 'QuotaExceededError')
    realSetItem.call(this, key, value)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('full')
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBeNull()
})

it.each(['valid', 'unreadable', 'empty'] as const)('recovers a stale autosave owner with explicit confirmation for a %s slot', (kind) => {
  const saved = seedSlot('autosave', 4242)
  if (kind === 'unreadable') localStorage.setItem(sandboxStorageKey('autosave'), '{broken JSON')
  if (kind === 'empty') localStorage.removeItem(sandboxStorageKey('autosave'))
  claimSandboxSlot('autosave', 'closed-tab')
  const previous = localStorage.getItem(sandboxStorageKey('autosave'))
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('local-takeover-autosave'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe('closed-tab')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  fireEvent.click(screen.getByTestId('local-takeover-autosave'))
  fireEvent.click(screen.getByRole('button', { name: 'Take over slot' }))
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe(getOrCreateTabSessionId())
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(screen.queryByTestId('local-takeover-autosave')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('start'))
  if (kind === 'valid') fireEvent.click(screen.getByTestId('start'))
  expect(screen.getByTestId('scene')).toBeInTheDocument()
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).not.toBe(saved)
})

it('preserves save bytes and the previous owner when an explicit takeover fails', () => {
  const previous = seedSlot('autosave', 4242)
  claimSandboxSlot('autosave', 'closed-tab')
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('local-takeover-autosave'))
  const realSetItem = Storage.prototype.setItem
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === sandboxOwnerStorageKey('autosave')) throw new DOMException('Full', 'QuotaExceededError')
    realSetItem.call(this, key, value)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Take over slot' }))
  expect(screen.getByRole('alert')).toHaveTextContent('full')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe('closed-tab')
})

it('allows deliberate recovery of a named slot before retrying a refused clear', () => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  claimSandboxSlot('slot-a', 'closed-tab')
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('local-takeover-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Take over slot' }))
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBe(getOrCreateTabSessionId())
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(loadSandbox('slot-a')).toBeNull()
  expect(runningScene().engineState.seed).toBe(4242)
})

it('stops the original writer on an intentional ownership transfer and leaves its saved tower intact', () => {
  const previous = seedSlot('autosave', 4242)
  render(<TowerGame />)
  resume()
  act(() => {
    claimSandboxSlot('autosave', 'second-tab')
    window.dispatchEvent(new StorageEvent('storage', {
      key: sandboxOwnerStorageKey('autosave'), newValue: 'second-tab',
    }))
  })
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  expect(screen.getByTestId('local-takeover-autosave')).toBeInTheDocument()
  hiddenTab()
  expect(localStorage.getItem(sandboxOwnerStorageKey('autosave'))).toBe('second-tab')
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
})

it.each(['unavailable', 'save-key', 'owner-key'] as const)('retains the cloud copy after %s clear failure and supports a confirmed retry', (failure) => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  const owner = getOrCreateTabSessionId()
  claimSandboxSlot('slot-a', owner)
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  expect(cloud.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  const removeItem = Storage.prototype.removeItem
  if (failure === 'unavailable') {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Unavailable') })
  } else {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === (failure === 'save-key' ? sandboxStorageKey('slot-a') : sandboxOwnerStorageKey('slot-a'))) {
        throw new DOMException('Denied', 'SecurityError')
      }
      removeItem.call(this, key)
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent(failure === 'unavailable' ? 'unavailable' : 'retained')
  expect(cloud.remove).not.toHaveBeenCalled()
  jest.restoreAllMocks()
  // Two keys are not a transaction: if releasing ownership failed, the tower
  // was already removed. Report that partial result and leave its owner intact.
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(failure === 'owner-key' ? null : previous)
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBe(owner)
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Cleared')
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBeNull()
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBeNull()
  expect(cloud.remove).toHaveBeenCalledTimes(1)
  expect(cloud.remove).toHaveBeenCalledWith('slot-a')
})

it.each(['readable', 'unknown-map'] as const)('preserves %s local bytes when cloud replacement is cancelled', (kind) => {
  seedSlot('autosave', 4242)
  let previous = seedSlot('slot-a', 999)
  if (kind === 'unknown-map') {
    previous = previous.replace('city-tower', 'future-tower')
    localStorage.setItem(sandboxStorageKey('slot-a'), previous)
  }
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
  expect(cloud.restore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  expect(cloud.restore).not.toHaveBeenCalled()
})

it('rechecks another tab’s ownership when a cloud replacement is confirmed', () => {
  seedSlot('autosave', 4242)
  const previous = seedSlot('slot-a', 999)
  render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
  claimSandboxSlot('slot-a', 'other-tab')
  fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('another tab')
  expect(cloud.restore).not.toHaveBeenCalled()
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
})

it('recovers same-slot manual save health after failure and does not repeat the pending write', () => {
  seedSlot('autosave', 4242)
  render(<TowerGame />)
  resume()
  const setItem = Storage.prototype.setItem
  const failure = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === sandboxStorageKey('autosave')) throw new DOMException('Full', 'QuotaExceededError')
    setItem.call(this, key, value)
  })
  act(() => runningScene().onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: false }))
  act(() => jest.advanceTimersByTime(5_000))
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'failed')
  openSaves()
  fireEvent.click(screen.getByTestId('save-autosave'))
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite save' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('full')
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'failed')
  failure.mockRestore()
  const writes = jest.spyOn(Storage.prototype, 'setItem')
  act(() => runningScene().onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: true }))
  act(drainCommands)
  fireEvent.click(screen.getByTestId('save-autosave'))
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite save' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Saved')
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'saved')
  expect(screen.queryByTestId('save-health-error')).not.toBeInTheDocument()
  expect(screen.getByTestId('save-health-time')).toHaveTextContent('just now')
  expect(writes.mock.calls.filter(([key]) => key === sandboxStorageKey('autosave'))).toHaveLength(1)
  act(() => jest.advanceTimersByTime(10_000))
  expect(writes.mock.calls.filter(([key]) => key === sandboxStorageKey('autosave'))).toHaveLength(1)
})

it('leaves a dirty active slot pending when manually saving a copy to another slot', () => {
  seedSlot('autosave', 4242)
  render(<TowerGame />)
  resume()
  act(() => runningScene().onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: false }))
  openSaves()
  fireEvent.click(screen.getByTestId('save-slot-a'))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Saved')
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'pending')
  const writes = jest.spyOn(Storage.prototype, 'setItem')
  act(drainCommands)
  act(() => jest.advanceTimersByTime(5_000))
  expect(writes.mock.calls.filter(([key]) => key === sandboxStorageKey('autosave'))).toHaveLength(1)
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'saved')
})

it.each(['settlement', 'hide'] as const)('updates health and cancels the debounce after a successful %s write', (trigger) => {
  seedSlot('autosave', 4242)
  render(<TowerGame />)
  resume()
  act(() => runningScene().onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: false }))
  const writes = jest.spyOn(Storage.prototype, 'setItem')
  act(drainCommands)
  if (trigger === 'settlement') {
    act(() => runningScene().onEvents?.([{ type: 'settlement', day: 1, net: 0 }]))
  } else {
    hiddenTab()
  }
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'saved')
  expect(writes.mock.calls.filter(([key]) => key === sandboxStorageKey('autosave'))).toHaveLength(1)
  act(() => jest.advanceTimersByTime(10_000))
  expect(writes.mock.calls.filter(([key]) => key === sandboxStorageKey('autosave'))).toHaveLength(1)
})

it.each(['hide', 'manual', 'debounce'] as const)('keeps an unconsumed command pending after a %s save, then persists it when the scene resumes', (trigger) => {
  seedSlot('autosave', 4242)
  render(<TowerGame />)
  resume()
  act(() => runningScene().onPlaceCommand?.({ type: 'setDisastersEnabled', enabled: false }))
  if (trigger === 'hide') {
    hiddenTab()
  } else if (trigger === 'manual') {
    openSaves()
    fireEvent.click(screen.getByTestId('save-autosave'))
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite save' }))
  } else {
    act(() => jest.advanceTimersByTime(5_000))
  }
  expect(loadSandbox()?.options.disastersEnabled).toBe(true)
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'pending')
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  fireEvent(document, new Event('visibilitychange'))
  act(drainCommands)
  act(() => jest.advanceTimersByTime(5_000))
  expect(loadSandbox()?.options.disastersEnabled).toBe(false)
  expect(screen.getByTestId('save-health')).toHaveAttribute('data-status', 'saved')
})

it.each(['refresh', 'remount'] as const)('can finish a partial clear after a %s discovers the missing local tower', (recovery) => {
  seedSlot('autosave', 4242)
  seedSlot('slot-a', 999)
  const owner = getOrCreateTabSessionId()
  claimSandboxSlot('slot-a', owner)
  const view = render(<TowerGame />)
  resume()
  openSaves()
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  const removeItem = Storage.prototype.removeItem
  const failure = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key === sandboxOwnerStorageKey('slot-a')) throw new DOMException('Denied', 'SecurityError')
    removeItem.call(this, key)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  failure.mockRestore()
  expect(loadSandbox('slot-a')).toBeNull()
  expect(screen.getByTestId('slot-summary-slot-a')).toHaveTextContent('Empty')
  expect(cloud.remove).not.toHaveBeenCalled()
  if (recovery === 'refresh') {
    fireEvent.click(screen.getByTestId('save-slot-b'))
  } else {
    view.unmount()
    render(<TowerGame />)
    resume()
    openSaves()
  }
  expect(screen.getByTestId('clear-slot-a')).toBeEnabled()
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBe(owner)
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Cleared')
  expect(localStorage.getItem(sandboxOwnerStorageKey('slot-a'))).toBeNull()
  expect(cloud.remove).toHaveBeenCalledWith('slot-a')
  expect(screen.getByTestId('clear-slot-a')).toBeDisabled()
})
