import { BLOCK_BLASTER_GAME_DATA, createInitialProgress, loadProgress, recordWin, saveProgress } from '../gameProgress'
import { BLOCK_BLASTER_PROGRESS_STORAGE_KEY, TOTAL_LEVELS } from '../gameTypes'

describe('block blaster progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns fresh default progress when storage is empty', () => {
    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 1, stars: {} })
  })

  it('round-trips a saved progress object', () => {
    saveProgress({ version: 1, unlockedLevel: 4, stars: { 1: 3, 2: 1, 3: 2 } })

    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 4, stars: { 1: 3, 2: 1, 3: 2 } })
  })

  it('falls back to defaults on corrupt JSON', () => {
    window.localStorage.setItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY, '{not valid json')

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('falls back to defaults on a wrong-version payload', () => {
    window.localStorage.setItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 2, unlockedLevel: 5, stars: {} }))

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('drops an out-of-range star without resetting the rest of progress', () => {
    window.localStorage.setItem(
      BLOCK_BLASTER_PROGRESS_STORAGE_KEY,
      JSON.stringify({ version: 1, unlockedLevel: 3, stars: { 1: 99, 2: 2 } }),
    )

    expect(loadProgress()).toEqual({ version: 1, unlockedLevel: 3, stars: { 2: 2 } })
  })

  it('records a win, raising stars and the unlock watermark', () => {
    const progress = createInitialProgress()

    const next = recordWin(progress, 1, 2)

    expect(next).toEqual({ version: 1, unlockedLevel: 2, stars: { 1: 2 } })
  })

  it('never lowers a previously earned star count', () => {
    const progress = { version: 1 as const, unlockedLevel: 3, stars: { 1: 3 } }

    const next = recordWin(progress, 1, 1)

    expect(next.stars[1]).toBe(3)
  })

  it('never lowers the unlocked-level watermark', () => {
    const progress = { version: 1 as const, unlockedLevel: 5, stars: {} }

    const next = recordWin(progress, 1, 1)

    expect(next.unlockedLevel).toBe(5)
  })

  it('caps the unlocked level at TOTAL_LEVELS', () => {
    const progress = { version: 1 as const, unlockedLevel: TOTAL_LEVELS, stars: {} }

    const next = recordWin(progress, TOTAL_LEVELS, 3)

    expect(next.unlockedLevel).toBe(TOTAL_LEVELS)
  })

  it('persists a recorded win across a save/load round trip', () => {
    const won = recordWin(createInitialProgress(), 1, 3)
    saveProgress(won)

    expect(loadProgress()).toEqual(won)
  })

  it('does not encode out-of-campaign level rows', () => {
    const slots = BLOCK_BLASTER_GAME_DATA.encode({
      version: 1,
      unlockedLevel: TOTAL_LEVELS,
      stars: { 0: 3, 1: 2, [TOTAL_LEVELS]: 3, [TOTAL_LEVELS + 1]: 3 },
    })

    expect(slots.filter((slot) => slot.scope === 'level').map((slot) => slot.slot)).toEqual([
      '1',
      String(TOTAL_LEVELS),
    ])
  })
})
