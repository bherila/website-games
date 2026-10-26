import { loadProgress, recordWin, saveProgress } from '../gameProgress'
import { LEVELS } from '../level'

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
  expect(loadProgress(storage)).toEqual({ version: 1, unlockedLevel: 3, stars: { 1: 3, 2: 3 } })
})


test('legacy two-level progress unlocks the windmill and later wins reach the mill', () => {
  const saved = loadProgress({ getItem: () => JSON.stringify({ version: 1, unlockedLevel: 2, stars: { 1: 3, 2: 3 } }) })
  expect(saved.unlockedLevel).toBe(3)
  const village = recordWin(recordWin(recordWin(saved, 3, 3), 4, 3), 5, 3)
  expect(village.unlockedLevel).toBe(6)
  expect(village.stars).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 })
})

test('a five-level save opens the waterwheel, the mill opens the harbor, and the last level unlocks nothing further', () => {
  const saved = loadProgress({ getItem: () => JSON.stringify({ version: 1, unlockedLevel: 5, stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 } }) })
  expect(saved.unlockedLevel).toBe(6)
  let progress = saved
  for (const level of [6, 7, 8, 9, 10]) progress = recordWin(progress, level, 3)
  expect(progress.unlockedLevel).toBe(11)
  for (let level = 11; level <= LEVELS.length; level++) progress = recordWin(progress, level, 3)
  expect(progress.unlockedLevel).toBe(LEVELS.length)
})
