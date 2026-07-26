import { loadBoardOrientationPreference, saveBoardOrientationPreference } from '../input/orientationStorage'

const STORAGE_KEY = 'bwh.chicks-challenge.board-orientation.v1'

describe('orientationStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to auto when nothing is stored', () => {
    expect(loadBoardOrientationPreference()).toBe('auto')
  })

  it('round-trips every preference', () => {
    for (const preference of ['auto', 'rotated', 'upright'] as const) {
      saveBoardOrientationPreference(preference)
      expect(loadBoardOrientationPreference()).toBe(preference)
    }
  })

  it('stores the preference under its own device-only key', () => {
    saveBoardOrientationPreference('rotated')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('"rotated"')
  })

  it('falls back to auto on corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadBoardOrientationPreference()).toBe('auto')
  })

  it('falls back to auto on an unknown or wrongly typed value', () => {
    window.localStorage.setItem(STORAGE_KEY, '"sideways"')
    expect(loadBoardOrientationPreference()).toBe('auto')

    window.localStorage.setItem(STORAGE_KEY, '90')
    expect(loadBoardOrientationPreference()).toBe('auto')

    window.localStorage.setItem(STORAGE_KEY, 'null')
    expect(loadBoardOrientationPreference()).toBe('auto')
  })
})
