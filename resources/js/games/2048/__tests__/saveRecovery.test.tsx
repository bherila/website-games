import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import { flushGameDataWrites, initializeGameDataPersistence, resetGameDataPersistenceForTests } from '../../_shared/gameDataPersistence'
import { startRun } from '../engine/gameRun'
import { Game2048 } from '../Game2048'
import { createInitialProgress, loadProgress, loadRunRecovery, loadSavedRun, replaceSavedRun, saveProgress, saveRun, TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA } from '../gameProgress'
import { TWENTY48_SAVE_STORAGE_KEY as SAVE_KEY } from '../gameTypes'

jest.mock('@/fetchWrapper', () => ({ fetchWrapper: { getRaw: jest.fn(), put: jest.fn() } }))
const mockGet = fetchWrapper.getRaw as jest.Mock
const mockPut = fetchWrapper.put as jest.Mock
const FUTURE = { version: 99, original: 'retain this future board' }
const INVALID = ['{', '', JSON.stringify(FUTURE), JSON.stringify({ version: 1, board: {} }), JSON.stringify({ unavailableRun: true })]

interface Operation { action: string; scope: string; slot: string; revision: number | null; data?: Record<string, unknown> }
function row(data: Record<string, unknown>, scope = 'save', revision = 7) {
  return { game: '2048', scope, slot: scope === 'save' ? 'autosave' : 'default', data, revision, updated_at: null }
}
function batch(body: { operations: Operation[] }, status = 'saved') {
  return { data: body.operations.map((operation) => ({
    action: operation.action, scope: operation.scope, slot: operation.slot, status,
    row: row(status === 'stale' ? FUTURE : operation.data ?? {}, operation.scope, (operation.revision ?? 0) + 1),
  })) }
}
async function hydrate(data: unknown[] = []) {
  const script = document.createElement('script')
  script.id = 'app-initial-data'
  script.type = 'application/json'
  script.textContent = JSON.stringify({ authenticated: true, currentUser: { id: 7 } })
  document.body.appendChild(script)
  mockGet.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => ({ data }) })
  await initializeGameDataPersistence([TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA])
}
function openReplacement() {
  const button = screen.getByRole('button', { name: 'New game' })
  act(() => button.focus())
  fireEvent.click(button)
  return button
}
async function confirmReplacement() {
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

beforeEach(() => {
  resetGameDataPersistenceForTests()
  localStorage.clear()
  document.getElementById('app-initial-data')?.remove()
  jest.clearAllMocks()
  mockPut.mockImplementation(async (_url: string, body: { operations: Operation[] }) => batch(body))
})
afterEach(() => {
  resetGameDataPersistenceForTests()
  document.getElementById('app-initial-data')?.remove()
  jest.restoreAllMocks()
})

it.each(INVALID)('retains unreadable browser bytes %p until explicit replacement', async (raw) => {
  localStorage.setItem(SAVE_KEY, raw)
  const progress = { ...createInitialProgress(), gamesPlayed: 12, boards: { ...createInitialProgress().boards, 4: { bestScore: 8192, highestTile: 1024 } } }
  saveProgress(progress)
  const first = render(<Game2048 initialSeed={10} />)
  expect(screen.getByRole('alert')).toHaveTextContent('cannot be loaded')
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  fireEvent.keyDown(window, { key: 'z' })
  fireEvent(window, new Event('pagehide'))
  expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  first.unmount()
  render(<Game2048 initialSeed={10} />)
  const origin = openReplacement()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Keep saved game' })).toHaveFocus())
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(origin).toHaveFocus())
  expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  fireEvent.click(screen.getByTestId('board-size-6'))
  await confirmReplacement()
  expect(loadSavedRun()?.board.size).toBe(6)
  expect(loadProgress()).toEqual(progress)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(loadSavedRun()?.moves).toBe(1)
})

it('keeps the guard when an inaccessible read becomes available later', () => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(FUTURE))
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
  expect(loadRunRecovery(null).problem).toBe('unavailable')
  render(<Game2048 initialSeed={10} />)
  expect(screen.getByRole('alert')).toHaveTextContent('storage is unavailable')
  get.mockRestore()
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(localStorage.getItem(SAVE_KEY)).toBe(JSON.stringify(FUTURE))
})

it('keeps the original and the dialog when an atomic browser replacement fails', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  render(<Game2048 initialSeed={10} />)
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  await screen.findByText(/new game could not be saved/)
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  set.mockRestore()
  await confirmReplacement()
  expect(loadSavedRun()).not.toBeNull()
})

it.each([{ rows: [] }, { rows: [row(FUTURE)] }])('retains raw browser and unknown cloud saves through hydration and unrelated queue settlement: $rows', async ({ rows }) => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate(rows)
  expect(loadRunRecovery().problem).toBe('invalid')
  render(<Game2048 initialSeed={10} />)
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(mockPut).not.toHaveBeenCalled()
  saveProgress({ ...createInitialProgress(), gamesPlayed: 2 })
  await act(async () => { await flushGameDataWrites() })
  expect(mockPut.mock.calls.every((call) => (call[1] as { operations: Operation[] }).operations.every((op) => op.scope === 'profile'))).toBe(true)
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(loadRunRecovery().problem).toBe('invalid')
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Keep saved game' }))
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
})

it('resumes a valid account run unchanged while retaining an unreadable browser original', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  const run = startRun(5, 88)
  await hydrate([row(TWENTY48_SAVE_DATA.encode(run)[0]!.data)])
  expect(loadSavedRun()).toEqual(run)
  saveProgress({ ...createInitialProgress(), gamesPlayed: 2 })
  await flushGameDataWrites()
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(loadSavedRun()).toEqual(run)
})

it('waits for the account commit, blocks repeat confirmation, and then cleans up the browser original', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate([row(FUTURE)])
  let finish!: () => void
  mockPut.mockImplementation((_url: string, body: { operations: Operation[] }) => new Promise((resolve) => { finish = () => resolve(batch(body)) }))
  render(<Game2048 initialSeed={10} />)
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Keep saved game' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  await act(async () => { finish() })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  expect(mockPut).toHaveBeenCalledTimes(1)
  expect((mockPut.mock.calls[0]![1] as { operations: Operation[] }).operations[0]?.revision).toBe(7)
  expect(loadSavedRun()?.board.size).toBe(4)
})

it('retains recovery bytes after account failure and explains that the consented retry may still sync', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate([row(FUTURE)])
  const error = jest.spyOn(console, 'error').mockImplementation(() => {})
  mockPut.mockRejectedValueOnce(new Error('Offline'))
  render(<Game2048 initialSeed={10} />)
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  await screen.findByText(/replacement has not reached your account yet/)
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => { fireEvent(window, new Event('pagehide')); await flushGameDataWrites() })
  expect(mockPut).toHaveBeenCalledTimes(2)
  expect(error).toHaveBeenCalledWith('Unable to save game data.', expect.any(Error))
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(screen.getByRole('alert')).toHaveTextContent('may still sync')
})

it('rejects a stale replacement and all later attempts without deleting either original', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate([row(FUTURE)])
  mockPut.mockImplementation(async (_url: string, body: { operations: Operation[] }) => batch(body, 'stale'))
  expect(await replaceSavedRun(startRun(4, 9))).toEqual({ ok: false, reason: 'conflict' })
  expect(await replaceSavedRun(startRun(3, 10))).toEqual({ ok: false, reason: 'conflict' })
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(mockPut).toHaveBeenCalledTimes(1)
})

it('does not delete a newer browser original or mount a new board after leaving during a commit', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate([row(FUTURE)])
  let finish!: () => void
  mockPut.mockImplementation((_url: string, body: { operations: Operation[] }) => new Promise((resolve) => { finish = () => resolve(batch(body)) }))
  const game = render(<Game2048 initialSeed={10} />)
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  game.unmount()
  localStorage.setItem(SAVE_KEY, JSON.stringify(FUTURE))
  await act(async () => { finish(); await flushGameDataWrites() })
  expect(localStorage.getItem(SAVE_KEY)).toBe(JSON.stringify(FUTURE))
  expect(mockPut).toHaveBeenCalledTimes(1)
})

it('reports inaccessible writes without touching storage', () => {
  expect(saveRun(startRun(4, 10), null)).toEqual({ ok: false, reason: 'unavailable' })
})

it.each([{ rows: [] }, { rows: [{ ...row({}, 'save', 8), is_deleted: true }] }])('treats empty and deleted account slots as ordinary new games: $rows', async ({ rows }) => {
  await hydrate(rows)
  render(<Game2048 initialSeed={10} />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(loadSavedRun()?.moves).toBe(1)
  await act(async () => { await flushGameDataWrites() })
  expect(mockPut).toHaveBeenCalledTimes(1)
})

it('preserves cloud recovery on an offline reload and reconnects only the explicitly confirmed replacement', async () => {
  localStorage.setItem(SAVE_KEY, '{')
  await hydrate([row(FUTURE)])
  resetGameDataPersistenceForTests()
  mockGet.mockRejectedValue(new TypeError('Failed to fetch'))
  await initializeGameDataPersistence([TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA])
  expect(loadRunRecovery().problem).toBe('invalid')
  render(<Game2048 initialSeed={10} />)
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(mockPut).not.toHaveBeenCalled()
  openReplacement()
  fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }))
  await screen.findByText(/replacement has not reached your account yet/)
  expect(mockPut).not.toHaveBeenCalled()
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')

  mockGet.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => ({ data: [row(FUTURE)] }) })
  await act(async () => {
    fireEvent(window, new Event('online'))
    // Wait for rehydration before forcing the restored queue to settle.
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3))
  })
  await act(async () => { await flushGameDataWrites() })
  expect(mockPut).toHaveBeenCalledTimes(1)
  const operation = (mockPut.mock.calls[0]![1] as { operations: Operation[] }).operations[0]
  expect(operation).toMatchObject({ scope: 'save', revision: 7, data: { version: 1, moves: 0 } })
  expect(localStorage.getItem(SAVE_KEY)).toBe('{')
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
})
