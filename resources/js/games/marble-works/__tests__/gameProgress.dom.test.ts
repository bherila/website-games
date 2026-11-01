import { definitionRowKey } from '../../_shared/gameDataPersistence'
import { createInitialProgress, loadProgress, MARBLE_WORKS_GAME_DATA, recordWin, saveProgress } from '../gameProgress'
import { MARBLE_WORKS_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from '../gameTypes'

describe('Marble Works progress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts with only level 1 unlocked', () => {
    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 1, stars: {} })
  })

  it('records a win, saves it and reloads it', () => {
    const next = recordWin(createInitialProgress(), 1, 3)
    saveProgress(next)

    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 2, stars: { 1: 3 } })
    expect(window.localStorage.getItem(MARBLE_WORKS_PROGRESS_STORAGE_KEY)).not.toBeNull()
  })

  it('never unlocks past the last level', () => {
    expect(recordWin({ version: 1, unlockedLevel: TOTAL_LEVELS, stars: {} }, TOTAL_LEVELS, 2).unlockedLevel).toBe(TOTAL_LEVELS)
  })

  it('encodes one profile row plus one row per starred level, and decodes them back', () => {
    const rows = MARBLE_WORKS_GAME_DATA.encode({ version: 1, unlockedLevel: 3, stars: { 1: 3, 2: 1 } })

    expect(rows.map((row) => `${row.scope}/${row.slot}`)).toEqual(['profile/default', 'level/1', 'level/2'])
    const decoded = MARBLE_WORKS_GAME_DATA.decode(new Map(rows.map((row) => [
      definitionRowKey(row.scope, row.slot),
      { game: 'marble-works', scope: row.scope, slot: row.slot, data: row.data, revision: 1, updatedAt: '' },
    ])))

    expect(decoded).toEqual({ version: 1, unlockedLevel: 3, stars: { 1: 3, 2: 1 } })
  })

  it('tags rows with the rebuilt campaign and ignores the original campaign’s rows', () => {
    const rows = MARBLE_WORKS_GAME_DATA.encode({ version: 1, unlockedLevel: 2, stars: { 1: 2 } })

    expect(rows.every((row) => row.data.campaign_revision === 2)).toBe(true)
    const original = new Map([
      [definitionRowKey('profile', 'default'), { game: 'marble-works' as const, scope: 'profile' as const, slot: 'default', data: { version: 1, unlocked_level: 12 }, revision: 1, updatedAt: '' }],
      [definitionRowKey('level', '5'), { game: 'marble-works' as const, scope: 'level' as const, slot: '5', data: { version: 1, stars: 3 }, revision: 1, updatedAt: '' }],
    ])

    expect(MARBLE_WORKS_GAME_DATA.decode(original)).toBeNull()
  })

  it('does not read the original campaign’s local save', () => {
    window.localStorage.setItem('bwh.marble-works.progress.v1', JSON.stringify({ version: 1, unlockedLevel: 12, stars: { 1: 3 } }))

    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 1, stars: {} })
  })
})
