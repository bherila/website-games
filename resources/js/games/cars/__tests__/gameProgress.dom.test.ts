import { definitionRowKey } from '../../_shared/gameDataPersistence'
import { generateLevel } from '../gameEngine'
import {
  CARS_PROGRESS_GAME_DATA,
  clearLevelSnapshot,
  createInitialProgress,
  LEVEL_SNAPSHOT_STORAGE_KEY,
  loadLevelSnapshot,
  loadProgress,
  recordWin,
  saveLevelSnapshot,
  saveProgress,
} from '../gameProgress'
import { GAME_PROGRESS_STORAGE_KEY } from '../gameTypes'
import { TOTAL_LEVELS } from '../levels/levels'

describe('cars game level snapshots', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves, loads, and clears a mid-level snapshot', () => {
    const state = generateLevel(3, 20_003, {
      powerUps: { fill: 1, shuffle: 2, vip: 3 },
      totalScore: 900,
      highScore: 1100,
    })
    state.moves = 2
    state.maxRegularSlotsUsed = 3
    state.maxRegularSlotsUnlocked = 5

    saveLevelSnapshot(state)

    const loaded = loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 3,
    })

    expect(loaded).toEqual(state)

    clearLevelSnapshot()

    expect(window.localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBeNull()
    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 3,
    })).toBeNull()
  })

  it('saves and loads a failed-level snapshot', () => {
    const state = generateLevel(3, 20_003)
    state.failedLevel = {
      level: 3,
      reason: 'No moves left. Restart the level to try again.',
    }

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 3,
    })).toEqual(state)
  })

  it('rejects stale versions and snapshots beyond the unlocked level', () => {
    const state = generateLevel(4, 20_004)

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      // v2 is intentionally stale here; v3 is the current snapshot schema.
      version: 2,
      state,
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 4,
    })).toBeNull()

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 3,
    })).toBeNull()
  })

  it('rejects snapshots with missing required state fields', () => {
    const state = generateLevel(2, 20_002)

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 3,
      state: {
        ...state,
        cars: undefined,
      },
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 2,
    })).toBeNull()

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 3,
      state: {
        ...state,
        failedLevel: {
          level: '2',
          reason: 'No moves left. Restart the level to try again.',
        },
      },
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 2,
    })).toBeNull()
  })

  it('rejects stale snapshots with old board dimensions or capacity lengths', () => {
    const state = generateLevel(5, 20_005)

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 3,
      state: {
        ...state,
        boardHeight: state.boardHeight - 2,
      },
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 5,
    })).toBeNull()

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 3,
      state: {
        ...state,
        cars: state.cars.map((car, index) => index === 0
          ? { ...car, capacity: 10, length: 5 }
          : car),
      },
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: 5,
    })).toBeNull()
  })
})

describe('cars game progress v3', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts fresh and ignores the old v2 progress key', () => {
    window.localStorage.setItem('bwh.cars-game.progress.v2', JSON.stringify({
      version: 2,
      level: 14,
      totalScore: 9000,
      highScore: 9000,
      powerUps: { vip: 2, shuffle: 2, fill: 2 },
    }))

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('round-trips progress with stars and unlock watermark', () => {
    const progress = {
      ...createInitialProgress(),
      unlockedLevel: 4,
      stars: { 1: 3, 2: 2, 3: 1 },
      totalScore: 4200,
      highScore: 4200,
    }
    saveProgress(progress)

    expect(loadProgress()).toEqual(progress)
  })

  it('drops malformed star entries without resetting valid progress', () => {
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      ...createInitialProgress(),
      unlockedLevel: 4,
      totalScore: 500,
      stars: { 1: 9, 2: 3 },
    }))

    expect(loadProgress()).toMatchObject({ unlockedLevel: 4, totalScore: 500, stars: { 2: 3 } })
  })

  it('records wins without lowering stars or the unlock watermark', () => {
    const initial = {
      ...createInitialProgress(),
      unlockedLevel: 6,
      stars: { 5: 3 },
      totalScore: 4000,
      powerUps: { vip: 2, shuffle: 1, fill: 0 },
    }
    const state = generateLevel(5)
    state.totalScore = 5000
    state.highScore = 6000
    state.completedLevel = { level: 5, score: 1200, stars: 1, awardedPowerUp: 'vip' }

    const next = recordWin(initial, state)

    expect(next.unlockedLevel).toBe(6)
    expect(next.stars[5]).toBe(3)
    expect(next.levelScores).toEqual(initial.levelScores)
    expect(next.totalScore).toBe(4000)
    expect(next.highScore).toBe(6000)
    expect(next.powerUps).toEqual(initial.powerUps)

    const advanced = recordWin({ ...createInitialProgress(), unlockedLevel: 5 }, state)

    expect(advanced.unlockedLevel).toBe(6)
    expect(advanced.stars[5]).toBe(1)
    expect(advanced.levelScores[5]).toBe(1200)
    expect(advanced.totalScore).toBe(5000)
  })

  it('does not lower reconciled score aggregates when recording a win', () => {
    const progress = {
      ...createInitialProgress(),
      totalScore: 900,
      highScore: 1_000,
      levelScores: { 2: 900 },
    }
    const state = generateLevel(1)
    state.totalScore = 100
    state.highScore = 100
    state.completedLevel = { level: 1, score: 100, stars: 3, awardedPowerUp: 'vip' }

    const next = recordWin(progress, state)

    expect(next.totalScore).toBe(1_000)
    expect(next.highScore).toBe(1_000)
  })

  it('lets the finale pre-unlock the next level for future campaigns', () => {
    const state = generateLevel(25)
    state.completedLevel = { level: 25, score: 900, stars: 3, awardedPowerUp: 'fill' }

    expect(recordWin(createInitialProgress(), state).unlockedLevel).toBe(26)
  })

  it('only encodes level rows in the current campaign', () => {
    const slots = CARS_PROGRESS_GAME_DATA.encode({
      ...createInitialProgress(),
      stars: { 0: 3, 1: 2, [TOTAL_LEVELS]: 3, [TOTAL_LEVELS + 1]: 3 },
      levelScores: { 0: 50, 1: 100, [TOTAL_LEVELS]: 200, [TOTAL_LEVELS + 1]: 300 },
    })

    expect(slots.filter((slot) => slot.scope === 'level').map((slot) => slot.slot)).toEqual([
      '1',
      String(TOTAL_LEVELS),
    ])
  })

  it('hydrates high score to at least the reconciled total of per-level bests', () => {
    const rows: Parameters<typeof CARS_PROGRESS_GAME_DATA.decode>[0] = new Map([
      [definitionRowKey('profile', 'default'), {
        game: 'parking-pickup',
        scope: 'profile',
        slot: 'default',
        data: { version: 3, unlocked_level: 2, total_score: 10, high_score: 250 },
        revision: 1,
        updatedAt: null,
      }],
      [definitionRowKey('level', '1'), {
        game: 'parking-pickup',
        scope: 'level',
        slot: '1',
        data: { version: 3, stars: 3, score: 100 },
        revision: 1,
        updatedAt: null,
      }],
      [definitionRowKey('level', '2'), {
        game: 'parking-pickup',
        scope: 'level',
        slot: '2',
        data: { version: 3, stars: 2, score: 200 },
        revision: 1,
        updatedAt: null,
      }],
    ])

    expect(CARS_PROGRESS_GAME_DATA.decode(rows)).toMatchObject({
      totalScore: 300,
      highScore: 300,
    })
  })
})
