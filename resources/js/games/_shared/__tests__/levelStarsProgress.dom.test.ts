import { defineLevelStarsProgress } from '../levelStarsProgress'

const api = defineLevelStarsProgress({ game: 'marble-works', storageKey: 'test.level-stars.v1', totalLevels: 5 })

describe('defineLevelStarsProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('falls back to fresh progress on missing, corrupt or wrong-version data', () => {
    expect(api.loadProgress()).toEqual(api.createInitialProgress())
    window.localStorage.setItem('test.level-stars.v1', '{nope')
    expect(api.loadProgress()).toEqual(api.createInitialProgress())
    window.localStorage.setItem('test.level-stars.v1', JSON.stringify({ version: 2, unlockedLevel: 3, stars: {} }))
    expect(api.loadProgress()).toEqual(api.createInitialProgress())
  })

  it('caps the unlock watermark at the campaign length', () => {
    expect(api.parseSavedProgress({ version: 1, unlockedLevel: 99, stars: {} })?.unlockedLevel).toBe(5)
  })

  it('keeps the best stars and highest unlock', () => {
    const progress = api.recordWin({ version: 1, unlockedLevel: 4, stars: { 1: 3 } }, 1, 1)

    expect(progress).toEqual({ version: 1, unlockedLevel: 4, stars: { 1: 3 } })
  })

  it('survives a throwing storage on save', () => {
    const storage = { setItem: () => { throw new Error('quota') } }

    expect(() => api.saveProgress(api.createInitialProgress(), storage)).not.toThrow()
  })

  it('skips out-of-range level rows when encoding', () => {
    const rows = api.gameData.encode({ version: 1, unlockedLevel: 5, stars: { 0: 3, 2: 2, 6: 1 } })

    expect(rows.map((row) => `${row.scope}/${row.slot}`)).toEqual(['profile/default', 'level/2'])
  })
})
