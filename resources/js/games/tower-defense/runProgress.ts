import { defineGameData, definitionRowKey, flushGameDataWrites, gameDataStorage, isSaveSlotBlocked } from '../_shared/gameDataPersistence'
import { isRecord, safeLocalStorage } from '../_shared/progressParsers'
import type { GameState } from './gameTypes'
import { TOWER_DEFENSE_SAVE_STORAGE_KEY } from './gameTypes'
import { MAX_RUN_BYTES, parseRunSnapshot, type RunSnapshot, snapshotRun } from './runSnapshot'

// A cloud row may belong to a newer client. Retain a recovery signal without
// rewriting or exposing that unrecognized payload as a runnable state.
type StoredRun = RunSnapshot | { unavailableRun: true }
const UNAVAILABLE_RUN: StoredRun = Object.freeze({ unavailableRun: true })

export const TOWER_DEFENSE_SAVE_DATA = defineGameData<StoredRun>({
  game: 'tower-defense',
  localStorageKey: TOWER_DEFENSE_SAVE_STORAGE_KEY,
  preserveInvalidLocal: true,
  parse: (value) => isRecord(value) && value.unavailableRun === true ? UNAVAILABLE_RUN : parseRunSnapshot(value),
  encode: (snapshot) => 'unavailableRun' in snapshot ? [] : [{ scope: 'save', slot: 'autosave', data: snapshot as unknown as Record<string, unknown> }],
  decode: (rows) => {
    const row = rows.get(definitionRowKey('save', 'autosave'))
    if (!row || row.isDeleted) return null
    return parseRunSnapshot(row.data) ?? UNAVAILABLE_RUN
  },
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

/** Called only after an explicitly chosen new run has committed successfully. */
export function discardInvalidBrowserRun(): void {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    const raw = storage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
    if (raw === null) return
    let valid = false
    if (raw.length <= MAX_RUN_BYTES) {
      try { valid = parseRunSnapshot(JSON.parse(raw)) !== null } catch { /* Keep the recovery copy until consent. */ }
    }
    if (valid) return
    const discard = (): void => {
      // A later writer or a failed account replacement keeps its recovery copy.
      if (isSaveSlotBlocked('tower-defense', 'autosave') || storage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY) !== raw) return
      storage.removeItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
    }
    if (gameDataStorage() === storage) discard()
    else {
      // An account write is asynchronous. Keep the browser's unreadable copy
      // until the confirmed replacement reaches the server; offline/failure
      // leaves it available even when the shadow store also cannot persist.
      void flushGameDataWrites().then(discard).catch(() => {})
    }
  } catch {
    // Declining cleanup must not turn a successful new run into a failed write.
  }
}
