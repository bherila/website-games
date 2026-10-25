import type { BootKind, GameState, KeyColor, TileKind } from '../engine/types'

export type InventorySlot = { kind: 'key', color: KeyColor } | { kind: 'boot', boot: BootKind }

export const KEY_COLORS: readonly KeyColor[] = ['red', 'green', 'blue', 'yellow']
export const BOOT_KINDS: readonly BootKind[] = ['flippers', 'fireBoots', 'skates', 'suctionBoots']
const KEY_TILES: Readonly<Record<KeyColor, TileKind>> = { red: 'keyRed', green: 'keyGreen', blue: 'keyBlue', yellow: 'keyYellow' }

/**
 * Every key colour and boot a level can put in the inventory, read once from
 * its starting board. The HUD reserves a slot for each from the first frame,
 * so picking one up fills a slot instead of pushing the board down.
 */
export function levelInventorySlots(start: GameState): InventorySlot[] {
  const tiles = new Set(start.tiles)
  return [
    ...KEY_COLORS.filter((color) => tiles.has(KEY_TILES[color]) || start.keys[color] > 0).map((color) => ({ kind: 'key' as const, color })),
    ...BOOT_KINDS.filter((boot) => tiles.has(boot) || start.boots[boot]).map((boot) => ({ kind: 'boot' as const, boot })),
  ]
}

/** Reserved slots, plus anything held that the level scan did not predict, in a stable order. */
export function inventoryRow(slots: readonly InventorySlot[], state: GameState): InventorySlot[] {
  const row = [...slots]
  for (const color of KEY_COLORS) if (state.keys[color] > 0 && !row.some((slot) => slot.kind === 'key' && slot.color === color)) row.push({ kind: 'key', color })
  for (const boot of BOOT_KINDS) if (state.boots[boot] && !row.some((slot) => slot.kind === 'boot' && slot.boot === boot)) row.push({ kind: 'boot', boot })
  return row
}
