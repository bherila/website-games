import { createInitialProgress, loadProgress, MATH_HORDE_GAME_DATA, recordWin, saveProgress } from '../gameProgress'

describe('Math Horde progress', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips anonymous progress', () => {
    const progress = recordWin(createInitialProgress(), 1, 2, 500, 8)
    saveProgress(progress)
    expect(loadProgress()).toEqual(progress)
  })

  it('keeps monotonic best results on replay', () => {
    const first = recordWin(createInitialProgress(), 1, 3, 900, 20)
    const replay = recordWin(first, 1, 1, 400, 5)
    expect(replay.results[1]).toEqual({ stars: 3, score: 900, survivors: 20 })
    expect(replay.unlockedLevel).toBe(2)
  })

  it('encodes profile and per-level database rows', () => {
    const progress = recordWin(createInitialProgress(), 1, 3, 900, 20)
    expect(MATH_HORDE_GAME_DATA.encode(progress)).toEqual([
      { scope: 'profile', slot: 'default', data: { version: 1, unlocked_level: 2, high_score: 900 } },
      { scope: 'level', slot: '1', data: { version: 1, stars: 3, score: 900, survivors: 20 } },
    ])
  })

  it('falls back safely for malformed progress', () => {
    window.localStorage.setItem('bwh.math-horde.progress.v1', '{bad json')
    expect(loadProgress()).toEqual(createInitialProgress())
  })
})
