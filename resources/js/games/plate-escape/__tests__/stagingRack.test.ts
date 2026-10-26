import { createPuzzle, hasWon, type PuzzleState, rackOpen, removeScrew, spareCapacity } from '../engine'
import type { Plate, PuzzleLevel, Screw } from '../level'
import { analyseLevel } from './puzzleSolver'

const RACK = 950
const NO_RACK = 951

/**
 * A board with a staging rack: one screw holds its cover, and a free panel carries the rest.
 * The same board without the rack is the control.
 */
jest.mock('../level', () => {
  const actual = jest.requireActual<typeof import('../level')>('../level')
  const panel = (id: string): Plate => ({ id, name: id, position: [0, 0, 0], size: [1, 1], normal: [0, 0, 1], up: [0, 1, 0], finish: 'side', color: '#ccc' })
  const pad = (color: Screw['color'], count: number): Screw[] => Array.from({ length: count }, (_, index) => ({ id: `${color}-${index}`, plate: 'board', color, position: [0, 0] }))
  const board = (id: number, rack?: string): PuzzleLevel => ({
    id, name: 'Rack', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'], ...(rack ? { rack } : {}),
    plates: [panel('board'), panel('rack-cover')],
    screws: [{ id: 'rack-1', plate: 'rack-cover', color: 'amber', position: [0, 0] }, ...pad('coral', 3), ...pad('mint', 3), ...pad('blue', 3), ...pad('amber', 2)],
  })
  const LEVELS = [...actual.LEVELS, board(950, 'rack-cover'), board(951)]
  return { ...actual, LEVELS, getLevel: (id: number) => LEVELS.find((level) => level.id === id) ?? actual.getLevel(id) }
})

/** Plays removals the way the game does, keeping each earlier board as an undo snapshot. */
function play(level: number, ids: readonly string[]): PuzzleState[] {
  const boards = [createPuzzle(level)]
  for (const id of ids) {
    const next = removeScrew(boards.at(-1)!, id)
    expect([id, next]).not.toEqual([id, boards.at(-1)])
    boards.push(next)
  }
  return boards
}

test('the rack starts shut, opens with its cover\'s last screw, and adds exactly one slot', () => {
  const [start, opened] = play(RACK, ['rack-1'])
  expect(rackOpen(start!)).toBe(false)
  expect(spareCapacity(start!)).toBe(2)
  expect(rackOpen(opened!)).toBe(true)
  expect(spareCapacity(opened!)).toBe(3)
  // A level without a rack never gains a slot.
  expect(spareCapacity(play(NO_RACK, ['rack-1']).at(-1)!)).toBe(2)
})

test('the screw that frees the rack can take the slot it opens, where the same move without a rack overflows', () => {
  const full = ['blue-0', 'amber-0']
  const freed = play(RACK, [...full, 'rack-1']).at(-1)!
  expect(freed.overflow).toBeNull()
  expect(freed.spare).toEqual(['blue', 'amber', 'amber'])
  expect(play(NO_RACK, full).at(-1)!.spare).toHaveLength(2)
  expect(removeScrew(play(NO_RACK, full).at(-1)!, 'rack-1').overflow).toBe('amber')
})

test('undo restores the capacity and the stored screws together', () => {
  const boards = play(RACK, ['blue-0', 'rack-1', 'amber-0'])
  // Rack open, three screws stored, one of them in the rack's slot.
  const parked = boards.at(-1)!
  expect(parked.spare).toEqual(['blue', 'amber', 'amber'])
  expect(spareCapacity(parked)).toBe(3)
  expect(parked.overflow).toBeNull()
  // Each earlier snapshot carries its own capacity and storage, never one without the other.
  expect(boards.map((board) => [spareCapacity(board), board.spare.length])).toEqual([[2, 0], [2, 1], [3, 2], [3, 3]])
  for (const board of boards) expect(board.spare.length).toBeLessThanOrEqual(spareCapacity(board))
})

test('a screw parked in the rack\'s slot goes back to the board when the release is undone', () => {
  // Free the rack first, then fill all three slots: the third screw is parked in the rack's slot.
  const boards = play(RACK, ['rack-1', 'blue-0', 'amber-0'])
  const parked = boards.at(-1)!
  expect(parked.spare).toEqual(['amber', 'blue', 'amber'])
  // The next unmatched screw has no room.
  expect(removeScrew(parked, 'blue-1').overflow).toBe('blue')
  // Undo back through the release: the rack is shut, its slot gone, and nothing is stranded in it.
  const beforeRelease = boards[0]!
  expect(rackOpen(beforeRelease)).toBe(false)
  expect(beforeRelease.spare).toEqual([])
  expect(beforeRelease.removed).toEqual([])
  // Replayed without the rack, the same two screws fill the base slots and the third overflows.
  const shut = play(RACK, ['blue-0', 'amber-0']).at(-1)!
  expect(spareCapacity(shut)).toBe(2)
  expect(removeScrew(shut, 'blue-1').overflow).toBe('blue')
})

test('a screw in the rack\'s slot drains into its tray like any stored screw', () => {
  let state = play(RACK, ['rack-1', 'blue-0', 'blue-1']).at(-1)!
  expect(state.spare).toEqual(['amber', 'blue', 'blue'])
  for (const id of ['coral-0', 'coral-1', 'coral-2']) state = removeScrew(state, id)
  // Coral done: blue's tray opens and takes both stored blues; the amber stays in storage.
  expect(state.trays.find((tray) => tray.color === 'blue')?.count).toBe(2)
  expect(state.spare).toEqual(['amber'])
  expect(spareCapacity(state)).toBe(3)
})

test('retry starts with the rack shut and its slot locked', () => {
  const opened = play(RACK, ['rack-1']).at(-1)!
  expect(rackOpen(opened)).toBe(true)
  expect(createPuzzle(RACK)).toEqual(play(RACK, []).at(-1))
  expect(rackOpen(createPuzzle(RACK))).toBe(false)
  expect(spareCapacity(createPuzzle(RACK))).toBe(2)
})

test('on every reachable board, storage never holds more than the capacity that board derives', () => {
  const analysis = analyseLevel(RACK)
  expect(analysis.win.length).toBe(12)
  for (const board of analysis.boards) {
    expect(board.spare.length).toBeLessThanOrEqual(spareCapacity(board))
    if (!rackOpen(board)) expect(board.spare.length).toBeLessThanOrEqual(2)
  }
  // The rack is a real third slot: some board stores three screws, which the control never can.
  expect(analysis.boards.some((board) => board.spare.length === 3)).toBe(true)
  expect(analyseLevel(NO_RACK).boards.every((board) => board.spare.length <= 2)).toBe(true)
  expect(analysis.randomWin).toBeGreaterThan(analyseLevel(NO_RACK).randomWin)
  expect(hasWon(createPuzzle(RACK))).toBe(false)
})
