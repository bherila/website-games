import { definitionRowKey, resetGameDataPersistenceForTests } from '../../_shared/gameDataPersistence'
import { createGameState } from '../gameEngine'
import { TOWER_DEFENSE_SAVE_STORAGE_KEY } from '../gameTypes'
import { LEVELS } from '../levels'
import { clearRun, loadRun, saveRun, TOWER_DEFENSE_SAVE_DATA } from '../runProgress'
import { snapshotRun } from '../runSnapshot'

beforeEach(() => { localStorage.clear(); resetGameDataPersistenceForTests() })

it('round-trips through the same local and account save codec without changing stars', () => {
  const state = createGameState(LEVELS[0]!)
  expect(saveRun(state).ok).toBe(true)
  expect(loadRun()).toEqual({ snapshot: snapshotRun(state), problem: null })
  const encoded = TOWER_DEFENSE_SAVE_DATA.encode(snapshotRun(state))
  expect(encoded).toEqual([{ scope: 'save', slot: 'autosave', data: snapshotRun(state) }])
  const row = { game: 'tower-defense' as const, scope: 'save' as const, slot: 'autosave', data: snapshotRun(state) as unknown as Record<string, unknown>, revision: 1, updatedAt: null }
  expect(TOWER_DEFENSE_SAVE_DATA.decode(new Map([[definitionRowKey('save', 'autosave'), row]]))).toEqual(snapshotRun(state))
  expect(clearRun()).toBe(true)
  expect(loadRun().snapshot).toBeNull()
})

it('preserves the previous bytes when a replacement write fails', () => {
  saveRun(createGameState(LEVELS[0]!))
  const previous = localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
  const broken = { setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  expect(saveRun(createGameState(LEVELS[1]!), broken)).toEqual({ ok: false, reason: 'full' })
  expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(previous)
})

it('handles unsupported, malformed, oversized and inaccessible saved runs without deleting them', () => {
  for (const value of ['{', JSON.stringify({ version: 99 }), 'x'.repeat(250_001)]) {
    localStorage.setItem(TOWER_DEFENSE_SAVE_STORAGE_KEY, value)
    expect(loadRun()).toEqual({ snapshot: null, problem: 'invalid' })
    expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(value)
  }
  expect(loadRun(null)).toEqual({ snapshot: null, problem: 'unavailable' })
  expect(loadRun({ getItem: () => { throw new Error('Blocked') } })).toEqual({ snapshot: null, problem: 'unavailable' })
  expect(saveRun(createGameState(LEVELS[0]!), null)).toEqual({ ok: false, reason: 'unavailable' })
  expect(clearRun(null)).toBe(false)
  expect(clearRun({ removeItem: () => { throw new Error('Blocked') } })).toBe(false)
})
