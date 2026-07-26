import { defaultProgress, loadProgress, loadSavedProgress, recordWin, saveProgress } from '../gameProgress'
import { PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from '../gameTypes'

describe('chips progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns fresh default progress when storage is empty', () => {
    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('round-trips a saved progress object', () => {
    const saved = { version: 1 as const, unlockedLevel: 4, stars: { 1: 3, 2: 1 }, bestMoves: { 1: 12, 2: 40 } }
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

    expect(loadSavedProgress()).toEqual({ version: 1, unlockedLevel: 3, stars: { 2: 2 }, bestMoves: { 2: 20 } })
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

  it('persists a recorded win across a save/load round trip', () => {
    const won = recordWin(defaultProgress(), 1, 15, 2)
    saveProgress(won)

    expect(loadSavedProgress()).toEqual(won)
  })
})
