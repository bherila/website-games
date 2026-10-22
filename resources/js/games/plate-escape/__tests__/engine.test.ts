import { createPuzzle, freedPlates, hasWon, remainingScrews, removeScrew } from '../engine'
import { type ScrewColor,SCREWS } from '../level'

test('collects matching colors directly and holds unopened colors in spare storage', () => {
  const initial = createPuzzle()
  const coral = removeScrew(initial, 'front-1')
  expect(coral.trays[0]).toEqual({ id: 'left', color: 'coral', count: 1 })
  expect(initial.removed).toEqual([])
  expect(initial.trays[0]?.count).toBe(0)
  const blue = removeScrew(coral, 'right-roof-1')
  expect(blue.spare).toEqual(['blue'])
  expect(blue.removed).toEqual(['front-1', 'right-roof-1'])
})

test('opening the blue tray drains stored screws and completes it without another tap', () => {
  let state = createPuzzle()
  for (const id of ['right-roof-1', 'left-roof-2', 'back-1', 'front-1', 'left-1', 'right-roof-2']) state = removeScrew(state, id)
  expect(state.completed).toEqual(['coral', 'blue'])
  expect(state.spare).toEqual([])
  expect(state.trays[0]).toEqual({ id: 'left', color: null, count: 0 })
  expect(hasWon(state)).toBe(false)
})

test('the last support releases a plate, while all nine screws are required for victory', () => {
  let state = createPuzzle()
  state = removeScrew(state, 'front-1')
  expect(remainingScrews(state, 'front')).toBe(1)
  expect(freedPlates(state)).toBe(0)
  state = removeScrew(state, 'front-2')
  expect(freedPlates(state)).toBe(1)
  for (const screw of SCREWS) state = removeScrew(state, screw.id)
  expect(freedPlates(state)).toBe(6)
  expect(hasWon(state)).toBe(true)
  expect(state.spare).toEqual([])
})

test('duplicate and unknown taps do not consume storage or change the undo snapshot', () => {
  const state = removeScrew(createPuzzle(), 'front-1')
  expect(removeScrew(state, 'front-1')).toBe(state)
  expect(removeScrew(state, 'unknown')).toBe(state)
  const full = { ...state, spare: ['blue', 'blue', 'blue', 'blue'] as ScrewColor[] }
  expect(removeScrew(full, 'right-roof-1')).toBe(full)
})

test('every color order in the introductory level is solvable with the forgiving storage', () => {
  let checked = 0
  const walk = (order: ScrewColor[], counts: Record<ScrewColor, number>): void => {
    if (order.length < 9) {
      for (const color of ['coral', 'mint', 'blue'] as const) {
        if (counts[color] < 3) walk([...order, color], { ...counts, [color]: counts[color] + 1 })
      }
      return
    }
    let state = createPuzzle()
    for (const color of order) {
      const screw = SCREWS.find((candidate) => candidate.color === color && !state.removed.includes(candidate.id))!
      const next = removeScrew(state, screw.id)
      if (next === state || next.spare.length > 4) throw new Error(`Unsolvable tutorial order: ${order.join(',')}`)
      state = next
    }
    if (!hasWon(state) || state.spare.length !== 0) throw new Error(`Incomplete tutorial: ${order.join(',')}`)
    checked++
  }
  walk([], { coral: 0, mint: 0, blue: 0 })
  expect(checked).toBe(1680)
})
