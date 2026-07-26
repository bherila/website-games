import { definitionRowKey } from '../../_shared/gameDataPersistence'
import {
  clearLevelSnapshot,
  createInitialProgress,
  generateLevel,
  loadLevelSnapshot,
  loadProgress,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  MARBLE_SORT_SNAPSHOT_STORAGE_KEY,
  recordWin,
  saveLevelSnapshot,
  saveProgress,
  TOTAL_LEVELS,
} from '../gameEngine'
import { MARBLE_SORT_PROGRESS_GAME_DATA } from '../gameProgress'

describe('marble sort progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('loads initial progress when storage is missing or invalid', () => {
    expect(loadProgress()).toEqual(createInitialProgress())

    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, '{"version":2,"unlockedLevel":0}')

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('saves and loads progress with stars and sanitized power-up counts', () => {
    saveProgress({
      highScore: 200,
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
      stars: { 1: 3, 3: 2 },
      levelScores: { 1: 120, 3: 80 },
      totalScore: 120,
      unlockedLevel: 4,
      version: 2,
    })

    expect(loadProgress()).toEqual({
      highScore: 200,
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
      stars: { 1: 3, 3: 2 },
      levelScores: { 1: 120, 3: 80 },
      totalScore: 120,
      unlockedLevel: 4,
      version: 2,
    })
  })

  it('ignores the legacy v1 progress key so progress resets', () => {
    window.localStorage.setItem('bwh.marble-sort.progress.v1', JSON.stringify({
      version: 1,
      level: 9,
      totalScore: 900,
      highScore: 900,
      powerUps: { extraBelt: 1, magnet: 1, shuffle: 1 },
    }))

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('saves, loads, and clears an active level snapshot', () => {
    const state = generateLevel(1, 42_000)

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot()?.seed).toBe(state.seed)
    expect(loadLevelSnapshot()?.boxes).toEqual(state.boxes)

    clearLevelSnapshot()

    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).toBeNull()
  })

  it('preserves generated base conveyor capacity below the level-one default', () => {
    const state = generateLevel(12, 42_012)

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      unlockedLevel: state.level,
    })?.baseConveyorCapacity).toBe(state.baseConveyorCapacity)
  })

  it('preserves a belt-full game over snapshot until reset', () => {
    const state = {
      ...generateLevel(1, 42_001),
      gameOver: {
        message: 'The conveyor is full. Reset the level and pop boxes in a different order.',
        reason: 'belt_full' as const,
      },
    }

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot()?.gameOver?.reason).toBe('belt_full')
  })

  it('records wins with stars and an unlock watermark', () => {
    const completed = {
      ...generateLevel(1, 41_000),
      completedLevel: { awardedPowerUp: 'magnet' as const, level: 1, score: 100, stars: 3 },
      totalScore: 100,
    }

    const next = recordWin(createInitialProgress(), completed)

    expect(next).toMatchObject({
      unlockedLevel: 2,
      stars: { 1: 3 },
      totalScore: 100,
    })
    const replay = recordWin(next, {
      ...completed,
      completedLevel: { ...completed.completedLevel, score: 250, stars: 1 },
      totalScore: 200,
      powerUps: { magnet: 2, shuffle: 0, extraBelt: 0 },
    })
    expect(replay.stars[1]).toBe(3)
    expect(replay.levelScores[1]).toBe(100)
    expect(replay.totalScore).toBe(100)
    expect(replay.powerUps).toEqual(next.powerUps)
  })

  it('does not lower reconciled score aggregates when recording a win', () => {
    const completed = {
      ...generateLevel(1, 41_001),
      completedLevel: { awardedPowerUp: 'magnet' as const, level: 1, score: 100, stars: 3 },
      totalScore: 100,
      highScore: 100,
    }

    const next = recordWin({
      ...createInitialProgress(),
      totalScore: 900,
      highScore: 1_000,
      levelScores: { 2: 900 },
    }, completed)

    expect(next.totalScore).toBe(1_000)
    expect(next.highScore).toBe(1_000)
  })

  it('only encodes level rows in the current campaign', () => {
    const slots = MARBLE_SORT_PROGRESS_GAME_DATA.encode({
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
    const rows: Parameters<typeof MARBLE_SORT_PROGRESS_GAME_DATA.decode>[0] = new Map([
      [definitionRowKey('profile', 'default'), {
        game: 'marble-sort',
        scope: 'profile',
        slot: 'default',
        data: { version: 2, unlocked_level: 2, total_score: 10, high_score: 250 },
        revision: 1,
        updatedAt: null,
      }],
      [definitionRowKey('level', '1'), {
        game: 'marble-sort',
        scope: 'level',
        slot: '1',
        data: { version: 2, stars: 3, score: 100 },
        revision: 1,
        updatedAt: null,
      }],
      [definitionRowKey('level', '2'), {
        game: 'marble-sort',
        scope: 'level',
        slot: '2',
        data: { version: 2, stars: 2, score: 200 },
        revision: 1,
        updatedAt: null,
      }],
    ])

    expect(MARBLE_SORT_PROGRESS_GAME_DATA.decode(rows)).toMatchObject({
      totalScore: 300,
      highScore: 300,
    })
  })

  it('preserves slotIndex on conveyor marbles across save/load', () => {
    const base = generateLevel(1, 42_010)
    const state = {
      ...base,
      conveyor: [
        { id: 'm1', color: base.activeColors[0]!, sequence: 1, slotIndex: 0 },
        { id: 'm2', color: base.activeColors[1]!, sequence: 2, slotIndex: 7 },
      ],
    }

    saveLevelSnapshot(state)
    const loaded = loadLevelSnapshot()

    expect(loaded?.conveyor.map((marble) => ({ id: marble.id, slotIndex: marble.slotIndex }))).toEqual([
      { id: 'm1', slotIndex: 0 },
      { id: 'm2', slotIndex: 7 },
    ])
  })

  it('rejects a snapshot whose conveyor marbles are missing slotIndex', () => {
    const state = generateLevel(1, 42_011)
    const malformed = {
      version: 2,
      state: {
        ...state,
        conveyor: [{ id: 'm1', color: state.activeColors[0], sequence: 1 }],
      },
    }
    window.localStorage.setItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY, JSON.stringify(malformed))

    expect(loadLevelSnapshot()).toBeNull()
  })

  it('does not read from the legacy snapshot keys', () => {
    window.localStorage.setItem('bwh.marble-sort.snapshot.v2', JSON.stringify({
      version: 1,
      state: generateLevel(1, 42_013),
    }))

    expect(loadLevelSnapshot()).toBeNull()
  })
})
