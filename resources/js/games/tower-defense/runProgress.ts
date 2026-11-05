import { defineGameData, definitionRowKey, gameDataStorage, isSaveSlotBlocked } from '../_shared/gameDataPersistence'
import type { GameState } from './gameTypes'
import { TOWER_DEFENSE_SAVE_STORAGE_KEY } from './gameTypes'
import { MAX_RUN_BYTES, parseRunSnapshot, type RunSnapshot, snapshotRun } from './runSnapshot'

export const TOWER_DEFENSE_SAVE_DATA = defineGameData<RunSnapshot>({
  game: 'tower-defense',
  localStorageKey: TOWER_DEFENSE_SAVE_STORAGE_KEY,
  parse: parseRunSnapshot,
  encode: (snapshot) => [{ scope: 'save', slot: 'autosave', data: snapshot as unknown as Record<string, unknown> }],
  decode: (rows) => parseRunSnapshot(rows.get(definitionRowKey('save', 'autosave'))?.data),
  clearSlots: [{ scope: 'save', slot: 'autosave' }],
})

export interface RunRecovery {
  snapshot: RunSnapshot | null
  problem: 'unavailable' | 'invalid' | null
}
export type RunWriteResult = { ok: true; snapshot: RunSnapshot } | { ok: false; reason: 'unavailable' | 'full' | 'conflict' }

export function loadRun(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): RunRecovery {
  if (!storage) return { snapshot: null, problem: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
  } catch {
    return { snapshot: null, problem: 'unavailable' }
  }
  try {
    if (!raw) return { snapshot: null, problem: null }
    if (raw.length > MAX_RUN_BYTES) return { snapshot: null, problem: 'invalid' }
    const snapshot = parseRunSnapshot(JSON.parse(raw))
    return snapshot ? { snapshot: snapshot.status === 'playing' ? snapshot : null, problem: null } : { snapshot: null, problem: 'invalid' }
  } catch {
    return { snapshot: null, problem: 'invalid' }
  }
}

/** One atomic key write: a failed replacement never deletes the previous durable run. */
export function saveRun(state: GameState, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): RunWriteResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  if (isSaveSlotBlocked('tower-defense', 'autosave')) return { ok: false, reason: 'conflict' }
  const snapshot = snapshotRun(state)
  try {
    const serialized = JSON.stringify(snapshot)
    if (serialized.length > MAX_RUN_BYTES) return { ok: false, reason: 'full' }
    storage.setItem(TOWER_DEFENSE_SAVE_STORAGE_KEY, serialized)
    return { ok: true, snapshot }
  } catch {
    return { ok: false, reason: 'full' }
  }
}

export function clearRun(storage: Pick<Storage, 'removeItem'> | null = gameDataStorage()): boolean {
  if (!storage || isSaveSlotBlocked('tower-defense', 'autosave')) return false
  try {
    storage.removeItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
