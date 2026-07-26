import { freshProgress, MAP_ORDER, parseSavedProgress } from '../gameProgress'
import { MAPS } from '../maps/maps'

describe('hover saved progress', () => {
  test('fresh progress covers every shipped map', () => {
    const progress = freshProgress()
    expect(Object.keys(progress.mapsCleared).sort()).toEqual(MAPS.map((map) => map.id).sort())
    expect(MAP_ORDER).toEqual(MAPS.map((map) => map.id))
  })

  test('a save from before new maps shipped is kept, missing maps default to 0', () => {
    const legacy = {
      version: 1,
      bestScore: 4200,
      bestRoundIndex: 2,
      mapsCleared: { castle: 3, city: 2, sewer: 1 },
    }

    const parsed = parseSavedProgress(legacy)

    expect(parsed).not.toBeNull()
    expect(parsed?.bestScore).toBe(4200)
    expect(parsed?.bestRoundIndex).toBe(2)
    expect(parsed?.mapsCleared.castle).toBe(3)
    expect(parsed?.mapsCleared.neon).toBe(0)
    expect(parsed?.mapsCleared.temple).toBe(0)
  })

  test('a legacy multi-cycle bestRoundIndex is clamped to the roster that save knew', () => {
    const legacy = {
      version: 1,
      bestScore: 9000,
      bestRoundIndex: 6,
      mapsCleared: { castle: 3, city: 2, sewer: 2 },
    }

    const parsed = parseSavedProgress(legacy)

    expect(parsed?.bestRoundIndex).toBe(3)
  })

  test('a current-roster save keeps its endless-cycle bestRoundIndex unclamped', () => {
    const current = {
      version: 1,
      bestScore: 12000,
      bestRoundIndex: 12,
      mapsCleared: { castle: 2, city: 2, sewer: 2, neon: 1, glacier: 1, garden: 1, temple: 1 },
    }

    const parsed = parseSavedProgress(current)

    expect(parsed?.bestRoundIndex).toBe(12)
  })

  test('rejects a save with a malformed cleared count', () => {
    const corrupt = {
      version: 1,
      bestScore: 100,
      bestRoundIndex: 1,
      mapsCleared: { castle: 'lots' },
    }
    expect(parseSavedProgress(corrupt)).toBeNull()
  })

  test('rejects wrong versions and non-records', () => {
    expect(parseSavedProgress(null)).toBeNull()
    expect(parseSavedProgress({ version: 2, bestScore: 0, bestRoundIndex: 0, mapsCleared: {} })).toBeNull()
  })
})
