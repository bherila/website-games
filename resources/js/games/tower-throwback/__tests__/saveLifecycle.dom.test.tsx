import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, useEffect } from 'react'

import type { CloudSlotView } from '../cloudSync'
import { buildHudSnapshot, createEngineState } from '../engine/engine'
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
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot', exact: true }))
  } else {
    fireEvent.click(screen.getByTestId('cloud-restore-autosave'))
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
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(localStorage.getItem(sandboxStorageKey('autosave'))).toBe(previous)
  fireEvent.click(screen.getByTestId('import-save'))
  fireEvent.click(screen.getByRole('button', { name: 'Import and replace' }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Imported')
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot', exact: true }))
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
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower', exact: true }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Wait for the cloud restore')
  expect(runningScene().engineState.seed).toBe(4242)
  fireEvent.click(screen.getByTestId('save-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite save', exact: true }))
  expect(screen.getByTestId('save-message')).toHaveTextContent('Wait for the cloud restore')
  await act(async () => {
    const result = importSandbox(restoredBytes, 'slot-a')
    if (!result.ok) throw new Error('Fixture import failed')
    finish(result.saved)
    await Promise.resolve()
  })
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower', exact: true }))
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
  await act(async () => {
    fireEvent.click(screen.getByTestId('cloud-restore-slot-a'))
    await Promise.resolve()
  })
  expect(screen.getByTestId('save-message')).toHaveTextContent('Could not restore')
  expect(localStorage.getItem(sandboxStorageKey('slot-a'))).toBe(previous)
  fireEvent.click(screen.getByTestId('load-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Load tower', exact: true }))
  expect(runningScene().engineState.seed).toBe(999)
})
