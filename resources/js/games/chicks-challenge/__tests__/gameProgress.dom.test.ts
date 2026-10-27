import { definitionRowKey } from '../../_shared/gameDataPersistence'
import { CHICKS_GAME_DATA, defaultProgress, loadProgress, loadSavedProgress, parseSavedProgress, recordWin, type SavedChicksProgress,saveProgress } from '../gameProgress'
import { PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from '../gameTypes'
import { LEVEL_LAYOUT_REVISIONS } from '../levelLayoutRevisions'

describe('chips progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns fresh default progress when storage is empty', () => {
    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('round-trips a saved progress object', () => {
    const saved = { version: 1 as const, unlockedLevel: 4, stars: { 1: 3, 2: 1 }, bestMoves: { 1: 12, 2: 40 }, layoutRevisions: { 1: 1, 2: 1 } }
    saveProgress(saved)

    expect(loadSavedProgress()).toEqual(saved)
  })

  it('falls back to defaults on corrupt JSON', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, '{not valid json')

    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('falls back to defaults on a wrong-version payload', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 2, unlockedLevel: 5, stars: {}, bestMoves: {} }))

    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('drops an out-of-range star without resetting the rest of progress', () => {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({ version: 1, unlockedLevel: 3, stars: { 1: 99, 2: 2 }, bestMoves: { 2: 20 } }),
    )

    expect(loadSavedProgress()).toEqual({ version: 1, unlockedLevel: 3, stars: { 2: 2 }, bestMoves: { 2: 20 }, layoutRevisions: { 2: 1 } })
  })

  it('loadProgress adapts saved progress to the level-select shape', () => {
    saveProgress({ version: 1, unlockedLevel: 3, stars: { 1: 2 }, bestMoves: { 1: 20 } })

    expect(loadProgress()).toEqual({ unlockedLevel: 3, stars: { 1: 2 } })
  })

  it('records a win, unlocking the next level and setting stars/bestMoves', () => {
    const next = recordWin(defaultProgress(), 1, 12, 3)

    expect(next.unlockedLevel).toBe(2)
    expect(next.stars[1]).toBe(3)
    expect(next.bestMoves[1]).toBe(12)
  })

  it('never lowers a previously earned star count', () => {
    saveProgress({ version: 1, unlockedLevel: 3, stars: { 1: 3 }, bestMoves: { 1: 10 } })

    const next = recordWin(loadSavedProgress(), 1, 50, 1)

    expect(next.stars[1]).toBe(3)
  })

  it('never raises bestMoves above a previously recorded best', () => {
    saveProgress({ version: 1, unlockedLevel: 3, stars: { 1: 3 }, bestMoves: { 1: 10 } })

    const next = recordWin(loadSavedProgress(), 1, 50, 1)

    expect(next.bestMoves[1]).toBe(10)
  })

  it('lowers bestMoves when the new run beats the previous best', () => {
    saveProgress({ version: 1, unlockedLevel: 3, stars: { 1: 3 }, bestMoves: { 1: 20 } })

    const next = recordWin(loadSavedProgress(), 1, 8, 3)

    expect(next.bestMoves[1]).toBe(8)
  })

  it('never lowers the unlocked-level watermark', () => {
    saveProgress({ version: 1, unlockedLevel: 5, stars: {}, bestMoves: {} })

    const next = recordWin(loadSavedProgress(), 1, 10, 2)

    expect(next.unlockedLevel).toBe(5)
  })

  it('caps the unlocked level at TOTAL_LEVELS', () => {
    saveProgress({ version: 1, unlockedLevel: TOTAL_LEVELS, stars: {}, bestMoves: {} })

    const next = recordWin(loadSavedProgress(), TOTAL_LEVELS, 10, 3)

    expect(next.unlockedLevel).toBe(TOTAL_LEVELS)
  })

  it('opens the first new level for a save that finished the old 40-level pack', () => {
    // Written before the pack grew: the unlock was capped at the old total of 40.
    const stars: Record<number, number> = {}
    const bestMoves: Record<number, number> = {}
    for (let level = 1; level <= 40; level += 1) {
      stars[level] = level % 3 + 1
      bestMoves[level] = 10 + level
    }
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 40, stars, bestMoves }))

    const loaded = loadSavedProgress()

    expect(TOTAL_LEVELS).toBeGreaterThan(40)
    expect(loaded.unlockedLevel).toBe(41)
    expect(loaded.stars).toEqual(stars)
    for (const level of [7, 8, 12, 22, 23, 24, 37, 39, 40]) delete bestMoves[level]
    expect(loaded.bestMoves).toEqual(bestMoves)
  })

  it('keeps an old save’s unchanged bests, stars and unlock', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 12, stars: { 1: 3, 11: 2 }, bestMoves: { 1: 16, 11: 25 } }))

    expect(loadSavedProgress()).toEqual({ version: 1, unlockedLevel: 12, stars: { 1: 3, 11: 2 }, bestMoves: { 1: 16, 11: 25 }, layoutRevisions: { 1: 1, 11: 1 } })
  })

  it('decodes account rows from a finished 40-level pack into the first new level, keeping stars', () => {
    const row = (scope: 'profile' | 'level', slot: string, data: Record<string, unknown>) =>
      [definitionRowKey(scope, slot), { game: 'chicks-challenge' as const, scope, slot, data, revision: 1, updatedAt: null }] as const
    const rows = new Map([
      row('profile', 'default', { version: 1, unlocked_level: 40 }),
      row('level', '7', { version: 1, stars: 3, best_moves: 19 }),
      row('level', '40', { version: 1, stars: 2, best_moves: 130 }),
    ])

    const decoded = CHICKS_GAME_DATA.decode(rows) as SavedChicksProgress | null

    expect(decoded?.unlockedLevel).toBe(41)
    expect(decoded?.stars).toEqual({ 7: 3, 40: 2 })
    expect(decoded?.bestMoves).toEqual({})
  })

  it('persists a recorded win across a save/load round trip', () => {
    const won = recordWin(defaultProgress(), 1, 15, 2)
    saveProgress(won)

    expect(loadSavedProgress()).toEqual(won)
  })

  it('revisions every released layout and only marks the nine redrawn levels as changed', () => {
    expect(Object.keys(LEVEL_LAYOUT_REVISIONS).map(Number)).toEqual(Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1))
    expect(Object.entries(LEVEL_LAYOUT_REVISIONS).filter(([, revision]) => revision !== 1).map(([id]) => Number(id)))
      .toEqual([7, 8, 12, 22, 23, 24, 37, 39, 40])
  })

  it.each([7, 8, 12, 22, 23, 24, 37, 39, 40])('clears an old best on redrawn level %i while preserving stars and unlocks', (level) => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, unlockedLevel: 45, stars: { [level]: 3, 1: 2 }, bestMoves: { [level]: 19, 1: 16 } }))

    expect(loadSavedProgress()).toEqual({ version: 1, unlockedLevel: 45, stars: { [level]: 3, 1: 2 }, bestMoves: { 1: 16 }, layoutRevisions: { 1: 1 } })
  })

  it('records a new-layout best independently of an obsolete smaller count', () => {
    const won = recordWin({ version: 1, unlockedLevel: 9, stars: { 7: 3 }, bestMoves: { 7: 19 } }, 7, 46, 2)
    saveProgress(won)

    expect(loadSavedProgress()).toEqual({ version: 1, unlockedLevel: 9, stars: { 7: 3 }, bestMoves: { 7: 46 }, layoutRevisions: { 7: 2 } })
    expect(recordWin(won, 7, 50, 1).bestMoves[7]).toBe(46)
    expect(recordWin(won, 7, 45, 3).bestMoves[7]).toBe(45)
  })

  it('round-trips new layout revisions through account rows', () => {
    const won = recordWin(recordWin(defaultProgress(), 1, 16, 3), 7, 46, 2)
    const encoded = CHICKS_GAME_DATA.encode(won)
    expect(encoded.find((slot) => slot.scope === 'level' && slot.slot === '7')?.data).toEqual({ version: 1, stars: 2, best_moves: 46, layout_revision: 2 })
    const rows = new Map(encoded.map((slot) => [definitionRowKey(slot.scope, slot.slot), { ...slot, game: 'chicks-challenge' as const, revision: 1, updatedAt: null }]))

    expect(CHICKS_GAME_DATA.decode(rows)).toEqual(won)
  })

  it('promotes old stars without relabelling an obsolete best as a new-layout score', () => {
    const encoded = CHICKS_GAME_DATA.encode({ version: 1, unlockedLevel: 8, stars: { 7: 3 }, bestMoves: { 7: 19 } })

    expect(encoded.find((slot) => slot.scope === 'level')?.data).toEqual({ version: 1, stars: 3, layout_revision: 2 })
  })

  it('discards incompatible best metadata without losing earned stars', () => {
    for (const revision of [0, '2', 3]) {
      expect(parseSavedProgress({ version: 1, unlockedLevel: 8, stars: { 7: 3 }, bestMoves: { 7: 19 }, layoutRevisions: { 7: revision } }))
        .toEqual({ version: 1, unlockedLevel: 8, stars: { 7: 3 }, bestMoves: {}, layoutRevisions: {} })
    }
  })
})
