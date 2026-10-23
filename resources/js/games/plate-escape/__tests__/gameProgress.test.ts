import { loadProgress, recordWin, saveProgress } from '../gameProgress'

test('a cottage clear from the original one-level release unlocks the workshop', () => {
  const storage = { getItem: () => JSON.stringify({ version: 1, unlockedLevel: 1, stars: { 1: 3 } }) }
  expect(loadProgress(storage)).toEqual({ version: 1, unlockedLevel: 2, stars: { 1: 3 } })
  expect(loadProgress({ getItem: () => null }).unlockedLevel).toBe(1)
})

test('workshop stars survive a save and reload alongside the cottage clear', () => {
  let raw: string | null = null
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value } }
  const cottage = recordWin(loadProgress(storage), 1, 3)
  saveProgress(recordWin(cottage, 2, 3), storage)
  expect(loadProgress(storage)).toEqual({ version: 1, unlockedLevel: 2, stars: { 1: 3, 2: 3 } })
})
