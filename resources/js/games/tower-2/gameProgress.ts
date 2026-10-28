/**
 * Tower 2's account save: one tower per account in the `main` save slot, kept
 * in this browser when signed out and moved into the account on first sign-in.
 * Later tower files will each get their own slot.
 */
import { defineGameData, definitionRowKey } from '../_shared/gameDataPersistence'
import { type AnySnapshot, Building, type BuildingSnapshot } from './engine/building'

/** The browser key the game reads and writes; persistence mirrors it to the account. */
export const TOWER_2_STORAGE_KEY = 'tower-2-prototype'
export const TOWER_2_SAVE_SLOT = 'main'

/** A save that still replays under the current rules, upgraded to the current snapshot version; null otherwise. */
export function parseTowerSave(value: unknown): BuildingSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  try {
    return Building.fromSnapshot(value as AnySnapshot).snapshot()
  } catch {
    return null
  }
}

export const TOWER_2_SAVE_DATA = defineGameData<BuildingSnapshot>({
  game: 'tower-2',
  localStorageKey: TOWER_2_STORAGE_KEY,
  parse: parseTowerSave,
  encode: (snapshot) => [{ scope: 'save', slot: TOWER_2_SAVE_SLOT, data: snapshot as unknown as Record<string, unknown> }],
  decode: (rows) => parseTowerSave(rows.get(definitionRowKey('save', TOWER_2_SAVE_SLOT))?.data),
  clearSlots: [{ scope: 'save', slot: TOWER_2_SAVE_SLOT }],
})
