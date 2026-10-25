import { render, screen } from '@testing-library/react'

import type { GameState } from '../engine/types'
import { GameHud } from '../hud/GameHud'
import { BOOT_KINDS, KEY_COLORS, levelInventorySlots } from '../hud/inventorySlots'
import { LEVELS } from '../levels'
import { parseLevel } from '../levels/parseLevel'

const KEY_TILES = { red: 'keyRed', green: 'keyGreen', blue: 'keyBlue', yellow: 'keyYellow' } as const

test('every key and boot on every level board has a reserved slot, and nothing else does', () => {
  let levelsWithItems = 0
  for (const level of LEVELS) {
    const start = parseLevel(level)
    const tiles = new Set(start.tiles)
    const slots = levelInventorySlots(start)
    const expected = [
      ...KEY_COLORS.filter((color) => tiles.has(KEY_TILES[color])).map((color) => `key-${color}`),
      ...BOOT_KINDS.filter((boot) => tiles.has(boot)).map((boot) => `boot-${boot}`),
    ]
    expect(slots.map((slot) => slot.kind === 'key' ? `key-${slot.color}` : `boot-${slot.boot}`)).toEqual(expected)
    if (slots.length > 0) levelsWithItems++
  }
  expect(levelsWithItems).toBeGreaterThan(0)
})

test('picking up a key fills its reserved slot instead of adding a row', () => {
  const level = LEVELS.find((candidate) => parseLevel(candidate).tiles.includes('keyRed'))!
  const start = parseLevel(level)
  const slots = levelInventorySlots(start)
  const hud = (state: GameState) => <GameHud inventorySlots={slots} levelId={level.id} muted={false} par={level.par} state={state} onLevelSelect={() => {}} onRestart={() => {}} onToggleMute={() => {}} />
  const { rerender } = render(hud(start))
  const before = screen.getByTestId('inventory-row')
  expect(before.children).toHaveLength(slots.length)
  expect(screen.getByRole('img', { name: 'red key: not collected' })).toHaveAttribute('data-held', 'false')

  rerender(hud({ ...start, keys: { ...start.keys, red: 1 } }))

  // Same row element, same number of slots: only the red slot changes state.
  expect(screen.getByTestId('inventory-row')).toBe(before)
  expect(before.children).toHaveLength(slots.length)
  expect(screen.getByRole('img', { name: 'red key: 1' })).toHaveAttribute('data-held', 'true')
})

test('levels without items reserve no inventory row', () => {
  const level = LEVELS.find((candidate) => levelInventorySlots(parseLevel(candidate)).length === 0)!
  const start = parseLevel(level)
  render(<GameHud inventorySlots={[]} levelId={level.id} muted={false} par={level.par} state={start} onLevelSelect={() => {}} onRestart={() => {}} onToggleMute={() => {}} />)
  expect(screen.queryByTestId('inventory-row')).toBeNull()
})
